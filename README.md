# E-Pharmacy Backend Service

Enterprise-grade pharmacy management system backend with prescription OCR, inventory management, and real-time notifications.

##  Quick Start

### Prerequisites
- **Node.js** 18+ or **Bun** 1.0+
- **Docker & Docker Compose**
- **PostgreSQL** (via Docker)
- **Redis** (via Docker)

### Installation

1. **Install Dependencies**
   ```bash
   bun install
   # or
   npm install
   ```

2. **Setup Environment**
   ```bash
   cp config/.env.example config/.env
   # Edit config/.env with your settings
   ```

3. **Start Services with Docker**
   ```bash
   npm run docker:up
   # or
   docker compose -f docker-compose.yml up -d
   ```

4. **Run Development Server**
   ```bash
   npm run dev
   # Server starts on http://localhost:5000
   ```

---

##  Docker Commands

### Build Docker Image
```bash
npm run docker:build
# Builds image: e-pharmacy-backend
```

### Start All Services
```bash
npm run docker:up
# Starts: API (5000), Redis (6379)
```

### Stop Services
```bash
npm run docker:down
# Gracefully stops all containers
```

### View Logs
```bash
npm run docker:logs
# Real-time logs from all services
```

### Start Only Database/Redis
```bash
npm run db:up
# Starts Redis (6379)
```

---

##  Available Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Production server |
| `npm run dev` | Development server (watch mode) |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run tests (bun test) |
| `npm run format` | Format code with Prettier |
| `npm run seed:flags` | Seed feature flags |

---

##  Project Structure

```
Service1 backend/
├── config/              # Configuration files (DB, Redis, Socket.io)
├── Databases/           # Models & Schemas
│   ├── Models/         # Mongoose models
│   ├── Entities/       # Type definitions
│   └── Schema/         # Database schemas
├── Services/           # Business logic
│   ├── category.Service.ts
│   ├── item.Service.ts
│   ├── PrescriptionService/   # OCR & prescription handling
│   └── NotificationServices/  # Push notifications & queue
├── Routers/            # API routes
├── Middlewares/        # Express middleware
│   └── LogMedillewares/      # Notification & logging
├── Utils/              # Helper functions
│   ├── socketEmitters.ts      # Socket.io emissions
│   ├── notification.ts        # FCM push notifications
│   └── cache.ts               # Redis caching
├── tests/              # Test suites
├── docker-compose.yml  # Docker services definition
├── Dockerfile          # Container image
└── server.ts           # Entry point
```

---

##  Docker Compose Services

### app (E-Pharmacy Backend)
- **Port**: 5000
- **Image**: Builds from local Dockerfile
- **Environment**: Uses `config/.env`
- **Depends on**: Redis
- **Volumes**: `./temp_uploads` for OCR uploads

### redis (In-Memory Cache)
- **Port**: 6379
- **Image**: `redis:7-alpine`
- **Data**: Persistent volume `redis-data`
- **Command**: Redis server with AOF persistence

---

##  API Endpoints

### Prescriptions
- `POST /prescriptions/upload` - Upload prescription image for OCR
- `POST /prescriptions/upload-stream` - Upload with real-time processing

### Categories
- `GET /categories/simple` - Get categories with pagination
- `GET /categories/debug` - Debug info for category data
- `POST /categories` - Create category (Admin)

### Items
- `GET /items` - List items with filters
- `POST /items` - Create item

### Notifications
- `GET /notifications` - Get user notifications
- `POST /notification-service/push` - Internal service: send notifications

---

##  Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/e-pharmacy

# Cache
REDIS_URL=redis://redis:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_jwt_secret_here

# FCM (Push Notifications)
FCM_SERVICE_ACCOUNT=./config/fcm-service-account.json

# Cloudinary (Image Upload)
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# SendGrid (Email)
SENDGRID_API_KEY=your_sendgrid_key
```

---

##  Testing

### Run All Tests
```bash
npm run test
```

### Run Specific Test File
```bash
bun test tests/category.Service.test.ts
```

### Test Watch Mode
```bash
bun test --watch
```

---

##  Database Schemas

### User
- Email, name, phone
- FCM token for push notifications
- Role-based access (admin, user)

### Category
- Name, description, priority
- Category images
- Status (active/inactive)

### Item (Medicine)
- Name, dosage, manufacturer
- Price, stock quantity
- Category reference

### Notification Log
- User reference
- FCM token, message content
- Status (sent/failed)

---

## 🔄 Real-Time Features

### Socket.io Events
- `ocr:stream` - OCR processing updates
- `medicine_item` - Individual medicine detected
- `medicines_found` - All medicines extracted
- `categoryViewed:update` - Category view events
- `product:new` - New product added

### Push Notifications
- OCR completion with medicine count
- Prescription ready for review
- Error notifications with retry option

---

##  Error Handling

All endpoints return standardized responses:

### Success
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400
}
```

---

##  Code Quality

### Format Code
```bash
npm run format
```

### TypeScript Check
```bash
npm run build
```

### ESLint
```bash
npm run lint
```

---

##  Troubleshooting

### Redis Connection Failed
```bash
# Check Redis is running
docker compose logs redis

# Restart Redis
docker compose restart redis
```

### Port Already in Use
```bash
# Change port in docker-compose.yml or kill process
sudo lsof -i :5000
```

### OCR Processing Timeout
- Check image quality and size
- Increase timeout in `config/` settings
- Verify Python OCR service is running

---

## 📝 Development Workflow

1. Create a new branch: `git checkout -b feature/your-feature`
2. Make changes and format: `npm run format`
3. Build and test: `npm run build && npm run test`
4. Commit with clear messages
5. Push and create Pull Request

---

## 📜 License

MIT © 2026 E-Pharmacy

---

## 🤝 Support

For issues and questions:
- Check existing GitHub Issues
- Create a new Issue with details
- Contact: support@e-pharmacy.local
