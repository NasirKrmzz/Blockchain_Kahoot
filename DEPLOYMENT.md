# 🚀 Vercel Deployment Guide

## 📋 Deployment Steps

### 1. **Vercel CLI Kurulumu**
```bash
npm install -g vercel
```

### 2. **Vercel'e Login**
```bash
vercel login
```

### 3. **Proje Deploy**
```bash
cd sui-kahoot
vercel
```

### 4. **Environment Variables Ayarla**
Vercel Dashboard'da:
- `REACT_APP_BACKEND_URL` = `https://your-app.vercel.app`
- `REACT_APP_SUI_NETWORK` = `testnet`
- `REACT_APP_SUI_RPC_URL` = `https://fullnode.testnet.sui.io:443`

### 5. **Domain Ayarla (Opsiyonel)**
Vercel Dashboard'da custom domain ekle.

## 🔧 Configuration Files

- ✅ `vercel.json` - Vercel configuration
- ✅ `backend/package.json` - Backend dependencies
- ✅ Environment variables updated

## 📱 Test Checklist

- [ ] Frontend loads correctly
- [ ] Backend API endpoints work
- [ ] WebSocket connections work
- [ ] Quiz creation works
- [ ] Quiz joining works
- [ ] Real-time updates work

## 🚨 Important Notes

1. **Backend URL**: Update `REACT_APP_BACKEND_URL` after deployment
2. **HTTPS**: Vercel automatically provides HTTPS
3. **WebSocket**: May need additional configuration for production
4. **Environment**: All env vars must be set in Vercel dashboard

## 🔄 Redeploy

After making changes:
```bash
vercel --prod
```
