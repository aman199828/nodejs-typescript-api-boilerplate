# Node.js TypeScript API Boilerplate - Setup Guide

A production-ready Node.js TypeScript API boilerplate with Chat, Notifications, Admin Panel, and Authentication.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/your_database_name

# JWT
JWT_SECRET=your_jwt_secret_key_change_this_in_production
JWT_EXPIRES_IN=1d

# Server
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Application URLs
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000

# Firebase (for push notifications)
# Base64 encode your Firebase service account JSON:
# cat firebase-service-account.json | base64
FIREBASE_SERVICE_ACCOUNT=your_base64_encoded_firebase_service_account_json

# AWS S3 (optional - for file storage)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_S3_BUCKET=your_s3_bucket_name
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio to view database
npm run prisma:studio
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

API Documentation: `http://localhost:3000/api-docs`

## Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── lib/             # Core libraries (Prisma)
├── middleware/      # Express middleware
├── modules/         # Feature modules
│   ├── chat/        # Chat module (Socket.IO)
│   └── notifications/ # Notifications module (Firebase FCM)
├── repositories/    # Data access layer
├── resources/       # API response utilities
├── routes/          # Route definitions
├── services/        # Business logic services
├── types/           # TypeScript types
├── utils/           # Utility functions
├── validations/     # Validation schemas
└── server.ts        # Application entry point
```

## Features

- **Authentication**: User & Admin authentication with JWT
- **Chat**: Real-time messaging with Socket.IO
- **Notifications**: Push notifications with Firebase FCM
- **Admin Panel**: User management and static pages
- **File Storage**: Local or AWS S3 storage
- **API Documentation**: Swagger/OpenAPI docs

## API Endpoints

### Authentication
- `POST /api/v1/auth/signup` - User signup
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/mobile/auth/signup` - Mobile signup
- `POST /api/v1/mobile/auth/login` - Mobile login

### Chat
- `GET /api/v1/mobile/chat/conversations` - List conversations
- `POST /api/v1/mobile/chat/conversations` - Create conversation
- `GET /api/v1/mobile/chat/conversations/:id/messages` - Get messages

### Notifications
- `GET /api/v1/mobile/notifications` - List notifications
- `PUT /api/v1/mobile/notifications/:id/read` - Mark as read

### Admin
- `POST /api/v1/admin/login` - Admin login
- `GET /api/v1/admin/users` - List users
- `GET /api/v1/admin/pages` - List static pages

## Socket.IO

Chat uses Socket.IO for real-time communication.

**Connection**: `ws://localhost:3000/socket`

**Events**:
- `message:send` - Send a message
- `message:received` - Message received
- `typing:start` - User started typing
- `typing:stop` - User stopped typing

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Generate a service account key:
   - Go to Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file
3. Base64 encode the JSON:
   ```bash
   cat firebase-service-account.json | base64
   ```
4. Add the encoded string to `.env` as `FIREBASE_SERVICE_ACCOUNT`

## AWS S3 Setup (Optional)

1. Create an S3 bucket in AWS Console
2. Create an IAM user with S3 permissions
3. Generate access keys
4. Add credentials to `.env`

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio

## Database Schema

The Prisma schema includes:
- User model
- Auth models (RefreshToken, AuthToken, etc.)
- Chat models (Conversation, Message, etc.)
- Notification models (Notification, DeviceDetails)
- Call models (CallLog)
- Admin models (AuditLog, Page)

## Requirements

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL database
- Firebase project (for push notifications)

## License

ISC
