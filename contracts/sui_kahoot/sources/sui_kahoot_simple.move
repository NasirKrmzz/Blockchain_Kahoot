module sui_kahoot::sui_kahoot_simple {
    use std::string::String;
    use std::vector;
    use std::option::Option;
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::event;

    // ===== ERRORS =====
    const EQuizNotFound: u64 = 0;
    const EQuizAlreadyStarted: u64 = 1;
    const EQuizNotStarted: u64 = 2;
    const EQuizAlreadyEnded: u64 = 3;
    const ENotQuizCreator: u64 = 4;
    const EAlreadyParticipated: u64 = 5;
    const EInvalidAnswer: u64 = 6;
    const EInsufficientReward: u64 = 7;
    const EQuizNotEnded: u64 = 8;
    const ENoParticipants: u64 = 9;
    const EInvalidQuestionIndex: u64 = 10;

    // ===== STRUCTS =====
    
    /// Quiz sorusu yapısı
    public struct Question has store, copy, drop {
        question: String,
        options: vector<String>,
        correct_answer: u8,
        time_limit: u64,
    }

    /// Ana Quiz objesi
    public struct Quiz has key, store {
        id: UID,
        title: String,
        description: String,
        creator: address,
        questions: vector<Question>,
        participants: vector<address>, // Basit participant listesi
        reward_amount: u64,
        is_public: bool,
        join_code: String,
        status: u64, // 0=created, 1=started, 2=ended
        created_at: u64,
        total_participants: u64,
        reward_balance: Balance<SUI>,
    }

    /// AdminCap - Quiz creator'ın ödül dağıtma yetkisi
    public struct QuizAdminCap has key, store {
        id: UID,
        quiz_id: String,
        creator: address,
    }

    /// SBT (Soulbound Token) - Transfer edilemeyen NFT
    public struct QuizSBT has key, store {
        id: UID,
        quiz_id: String,
        participant: address,
        score: u64,
        rank: u64,
        minted_at: u64,
    }

    // ===== EVENTS =====

    public struct QuizCreated has copy, drop {
        quiz_id: String,
        creator: address,
        title: String,
        question_count: u64,
    }

    public struct QuizJoined has copy, drop {
        quiz_id: String,
        participant: address,
        join_code: String,
    }

    public struct QuizStarted has copy, drop {
        quiz_id: String,
        started_at: u64,
    }

    public struct QuizEnded has copy, drop {
        quiz_id: String,
        ended_at: u64,
        total_participants: u64,
    }

    public struct RewardDistributed has copy, drop {
        quiz_id: String,
        participant: address,
        amount: u64,
        rank: u64,
    }

    public struct SBTMinted has copy, drop {
        quiz_id: String,
        participant: address,
        score: u64,
        rank: u64,
    }

    // ===== INIT FUNCTION =====

    fun init(ctx: &mut TxContext) {
        // Initialization logic if needed
    }

    // ===== QUIZ CREATION =====

    /// Yeni quiz oluştur
    public fun create_quiz(
        title: String,
        description: String,
        questions: vector<Question>,
        reward_amount: u64,
        is_public: bool,
        join_code: String,
        reward_coin: Coin<SUI>,
        ctx: &mut TxContext
    ): (Quiz, QuizAdminCap) {
        let questions_count = vector::length(&questions);
        assert!(questions_count > 0, EInvalidQuestionIndex);
        assert!(reward_amount > 0, EInsufficientReward);

        let quiz_id = b"quiz_".to_string();

        let quiz = Quiz {
            id: object::new(ctx),
            title,
            description,
            creator: tx_context::sender(ctx),
            questions,
            participants: vector::empty(),
            reward_amount,
            is_public,
            join_code,
            status: 0, // 0 = created
            created_at: 0, // Basit timestamp
            total_participants: 0,
            reward_balance: coin::into_balance(reward_coin),
        };

        // AdminCap oluştur
        let admin_cap = QuizAdminCap {
            id: object::new(ctx),
            quiz_id,
            creator: tx_context::sender(ctx),
        };

        // Event emit et
        event::emit(QuizCreated {
            quiz_id,
            creator: tx_context::sender(ctx),
            title,
            question_count: questions_count,
        });

        (quiz, admin_cap)
    }

    // ===== PARTICIPATION =====

    /// Quiz'e katılım
    public fun join_quiz(
        quiz: &mut Quiz,
        join_code: String,
        ctx: &mut TxContext
    ) {
        let participant_addr = tx_context::sender(ctx);
        
        // Quiz durumunu kontrol et
        assert!(quiz.status == 0, EQuizNotFound); // 0 = created
        
        // Join code kontrolü
        if (!quiz.is_public) {
            assert!(quiz.join_code == join_code, EInvalidAnswer);
        };

        // Daha önce katılmış mı kontrol et
        let participants = &quiz.participants;
        let len = vector::length(participants);
        let mut i = 0;
        while (i < len) {
            let participant_addr_existing = *vector::borrow(participants, i);
            assert!(participant_addr_existing != participant_addr, EAlreadyParticipated);
            i = i + 1;
        };

        // Katılımcıyı ekle
        vector::push_back(&mut quiz.participants, participant_addr);
        quiz.total_participants = quiz.total_participants + 1;

        // Event emit et
        event::emit(QuizJoined {
            quiz_id: b"quiz_joined".to_string(),
            participant: participant_addr,
            join_code,
        });
    }

    /// Quiz'i başlat (sadece creator)
    public fun start_quiz(
        quiz: &mut Quiz,
        ctx: &mut TxContext
    ) {
        assert!(quiz.creator == tx_context::sender(ctx), ENotQuizCreator);
        assert!(quiz.status == 0, EQuizAlreadyStarted); // 0 = created
        
        quiz.status = 1; // 1 = started
        
        event::emit(QuizStarted {
            quiz_id: b"quiz_started".to_string(),
            started_at: 0,
        });
    }

    /// Quiz'i bitir (sadece creator)
    public fun end_quiz(
        quiz: &mut Quiz,
        ctx: &mut TxContext
    ) {
        assert!(quiz.creator == tx_context::sender(ctx), ENotQuizCreator);
        assert!(quiz.status == 1, EQuizNotStarted); // 1 = started
        
        quiz.status = 2; // 2 = ended
        
        event::emit(QuizEnded {
            quiz_id: b"quiz_ended".to_string(),
            ended_at: 0,
            total_participants: quiz.total_participants,
        });
    }

    // ===== REWARD DISTRIBUTION =====

    /// Ödül dağıt (sadece AdminCap sahibi) - Basit versiyon
    public fun distribute_rewards_simple(
        quiz: &mut Quiz,
        admin_cap: &QuizAdminCap,
        _ctx: &mut TxContext
    ) {
        assert!(admin_cap.creator == tx_context::sender(_ctx), ENotQuizCreator);
        assert!(quiz.status == 2, EQuizNotEnded); // 2 = ended
        assert!(quiz.total_participants > 0, ENoParticipants);

        // Basit ödül dağıtımı - ilk katılımcıya
        let participants = &quiz.participants;
        if (vector::length(participants) > 0) {
            let winner = *vector::borrow(participants, 0);
            
            // Event emit et (coin transfer'i frontend'te yapılacak)
            event::emit(RewardDistributed {
                quiz_id: b"reward_distributed".to_string(),
                participant: winner,
                amount: quiz.reward_amount,
                rank: 1,
            });
        };
    }

    // ===== SBT MINTING =====

    /// SBT mint et
    public fun mint_sbt(
        quiz: &Quiz,
        participant: address,
        score: u64,
        rank: u64,
        ctx: &mut TxContext
    ): QuizSBT {
        QuizSBT {
            id: object::new(ctx),
            quiz_id: b"sbt_minted".to_string(),
            participant,
            score,
            rank,
            minted_at: 0,
        }
    }

    // ===== GETTER FUNCTIONS =====

    /// Quiz bilgilerini al
    public fun get_quiz_info(quiz: &Quiz): (String, String, address, u64, bool, String, u64) {
        (
            quiz.title,
            quiz.description,
            quiz.creator,
            quiz.reward_amount,
            quiz.is_public,
            quiz.join_code,
            quiz.status
        )
    }

    /// Quiz durumunu al
    public fun get_quiz_status(quiz: &Quiz): u64 {
        quiz.status
    }

    /// Katılımcı sayısını al
    public fun get_participant_count(quiz: &Quiz): u64 {
        quiz.total_participants
    }

    /// AdminCap'i transfer et
    public fun transfer_admin_cap(admin_cap: QuizAdminCap, recipient: address, _ctx: &TxContext) {
        transfer::transfer(admin_cap, recipient)
    }
}
