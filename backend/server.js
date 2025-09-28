const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// CORS ayarları
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Quiz verilerini saklamak için
const quizzes = new Map();
const participants = new Map();

// API Routes
app.get('/api/quizzes', (req, res) => {
  const publicQuizzes = Array.from(quizzes.values()).filter(quiz => quiz.isPublic);
  res.json(publicQuizzes);
});

app.get('/api/quiz/:id', (req, res) => {
  const quiz = quizzes.get(req.params.id);
  if (quiz) {
    res.json(quiz);
  } else {
    res.status(404).json({ error: 'Quiz not found' });
  }
});

app.post('/api/quiz', (req, res) => {
  const quiz = req.body;
  quiz.id = quiz.id || `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  quiz.createdAt = Date.now();
  quiz.participants = quiz.participants || [];
  
  quizzes.set(quiz.id, quiz);
  console.log('📝 Quiz created:', quiz.id);
  
  // Broadcast quiz creation to all connected clients
  io.emit('quiz_created', quiz);
  
  res.json(quiz);
});

app.put('/api/quiz/:id', (req, res) => {
  const quiz = quizzes.get(req.params.id);
  if (quiz) {
    Object.assign(quiz, req.body);
    quizzes.set(req.params.id, quiz);
    res.json(quiz);
  } else {
    res.status(404).json({ error: 'Quiz not found' });
  }
});

// WebSocket bağlantıları
io.on('connection', (socket) => {
  console.log('👤 Yeni kullanıcı bağlandı:', socket.id);

  // Quiz'e katılma
  socket.on('join_quiz', (data) => {
    const { quizId, userAddress, userName } = data;
    
    console.log(`🎯 ${userName} (${userAddress}) quiz'e katıldı: ${quizId}`);
    
    // Socket'i quiz room'una ekle
    socket.join(`quiz_${quizId}`);
    
    // Katılımcı bilgilerini sakla
    if (!participants.has(quizId)) {
      participants.set(quizId, new Map());
    }
    
    participants.get(quizId).set(userAddress, {
      address: userAddress,
      name: userName,
      score: 0,
      answers: [],
      connected: true,
      socketId: socket.id
    });

    // Quiz bilgilerini güncelle
    if (!quizzes.has(quizId)) {
      quizzes.set(quizId, {
        id: quizId,
        participants: [],
        status: 'created',
        currentQuestion: 0,
        started: false,
        ended: false
      });
    }

    const quiz = quizzes.get(quizId);
    quiz.participants = Array.from(participants.get(quizId).values());

    // Tüm katılımcılara güncelleme gönder
    io.to(`quiz_${quizId}`).emit('participant_joined', {
      quizId,
      participant: {
        address: userAddress,
        name: userName,
        score: 0
      },
      totalParticipants: quiz.participants.length
    });

    // Yeni katılımcıya mevcut durumu gönder
    socket.emit('quiz_status', {
      quizId,
      status: quiz.status,
      participants: quiz.participants,
      currentQuestion: quiz.currentQuestion,
      started: quiz.started,
      ended: quiz.ended
    });
  });

  // Quiz'i başlatma (sadece creator)
  socket.on('start_quiz', (data) => {
    const { quizId, creatorAddress } = data;
    
    console.log(`🚀 Quiz başlatıldı: ${quizId} by ${creatorAddress}`);
    
    const quiz = quizzes.get(quizId);
    if (quiz) {
      quiz.status = 'started';
      quiz.started = true;
      quiz.currentQuestion = 0;
      
      // Tüm katılımcılara quiz başladığını bildir
      io.to(`quiz_${quizId}`).emit('quiz_started', {
        quizId,
        startedAt: Date.now(),
        totalQuestions: 5 // Mock data
      });
    }
  });

  // Quiz'i bitirme (sadece creator)
  socket.on('end_quiz', (data) => {
    const { quizId, creatorAddress } = data;
    
    console.log(`🏁 Quiz bitti: ${quizId} by ${creatorAddress}`);
    
    const quiz = quizzes.get(quizId);
    if (quiz) {
      quiz.status = 'ended';
      quiz.ended = true;
      
      // Tüm katılımcılara quiz bittiğini bildir
      io.to(`quiz_${quizId}`).emit('quiz_ended', {
        quizId,
        endedAt: Date.now(),
        participants: quiz.participants
      });
    }
  });

  // Cevap gönderme
  socket.on('submit_answer', (data) => {
    const { quizId, userAddress, questionIndex, answer, isCorrect } = data;
    
    console.log(`📝 ${userAddress} cevap verdi: ${answer} (${isCorrect ? 'Doğru' : 'Yanlış'})`);
    
    const quiz = quizzes.get(quizId);
    if (quiz && participants.has(quizId)) {
      const participant = participants.get(quizId).get(userAddress);
      if (participant) {
        participant.answers[questionIndex] = answer;
        if (isCorrect) {
          participant.score += 1;
        }
        
        // Tüm katılımcılara skor güncellemesi gönder
        io.to(`quiz_${quizId}`).emit('score_updated', {
          quizId,
          participant: {
            address: userAddress,
            name: participant.name,
            score: participant.score
          }
        });
      }
    }
  });

  // Ödül dağıtımı
  socket.on('distribute_rewards', (data) => {
    const { quizId, creatorAddress } = data;
    
    console.log(`💰 Ödüller dağıtıldı: ${quizId} by ${creatorAddress}`);
    
    const quiz = quizzes.get(quizId);
    if (quiz) {
      // En yüksek skorlu katılımcıyı bul
      const sortedParticipants = Array.from(participants.get(quizId).values())
        .sort((a, b) => b.score - a.score);
      
      const winner = sortedParticipants[0];
      
      // Tüm katılımcılara ödül dağıtımını bildir
      io.to(`quiz_${quizId}`).emit('rewards_distributed', {
        quizId,
        winner: {
          address: winner.address,
          name: winner.name,
          score: winner.score
        },
        distributedBy: creatorAddress
      });
    }
  });

  // Bağlantı kesildiğinde
  socket.on('disconnect', () => {
    console.log('👋 Kullanıcı ayrıldı:', socket.id);
    
    // Katılımcıyı offline olarak işaretle
    for (const [quizId, quizParticipants] of participants.entries()) {
      for (const [address, participant] of quizParticipants.entries()) {
        if (participant.socketId === socket.id) {
          participant.connected = false;
          console.log(`📴 ${participant.name} offline oldu`);
        }
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeQuizzes: quizzes.size,
    totalParticipants: Array.from(participants.values()).reduce((sum, p) => sum + p.size, 0)
  });
});

// Sponsored Transactions API
app.post('/api/sponsor-transaction', async (req, res) => {
  try {
    const { transactionBlockKindBytes, zkloginJwt, network } = req.body;
    
    console.log('💰 Sponsored transaction request:', { network, hasJwt: !!zkloginJwt });
    
    // Enoki API'ye sponsored transaction isteği gönder
    const enokiResponse = await fetch('https://api.enoki.mystenlabs.com/transaction-blocks/sponsor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'zklogin-jwt': zkloginJwt,
        'Authorization': `Bearer ${process.env.ENOKI_PRIVATE_KEY}`
      },
      body: JSON.stringify({
        network: network || 'testnet',
        transactionBlockKindBytes
      })
    });
    
    if (!enokiResponse.ok) {
      throw new Error(`Enoki API error: ${enokiResponse.status}`);
    }
    
    const result = await enokiResponse.json();
    
    res.json({
      success: true,
      transactionBytes: result.transactionBytes,
      digest: result.digest
    });
    
  } catch (error) {
    console.error('❌ Sponsored transaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Sign sponsored transaction
app.post('/api/sign-sponsored-transaction/:digest', async (req, res) => {
  try {
    const { digest } = req.params;
    const { signature } = req.body;
    
    console.log('✍️ Signing sponsored transaction:', digest);
    
    // Enoki API'ye signature gönder
    const enokiResponse = await fetch(`https://api.enoki.mystenlabs.com/transaction-blocks/sponsor/${digest}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ENOKI_PRIVATE_KEY}`
      },
      body: JSON.stringify({ signature })
    });
    
    if (!enokiResponse.ok) {
      throw new Error(`Enoki API error: ${enokiResponse.status}`);
    }
    
    const result = await enokiResponse.json();
    
    res.json({
      success: true,
      sponsoredTransaction: result.sponsoredTransaction
    });
    
  } catch (error) {
    console.error('❌ Sign sponsored transaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3002;

server.listen(PORT, () => {
  console.log(`🚀 WebSocket Server çalışıyor: http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
