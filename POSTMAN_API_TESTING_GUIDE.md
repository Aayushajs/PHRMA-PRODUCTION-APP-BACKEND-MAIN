# 🔬 Pharmacy Microservices - Postman Testing Guide

## Overview
This guide covers all API endpoints across the three-service architecture:
- **API Gateway** (localhost:3000) - HTTP entry point
- **OCR Service** (localhost:5000) - Prescription processing & search
- **Medical Store Service** (localhost:5000) - Store & inventory management (gRPC on 50051)

---

## 📋 Table of Contents
1. [Environment Setup](#environment-setup)
2. [Authentication](#authentication)
3. [Prescription APIs](#prescription-apis)
4. [Search APIs](#search-apis)
5. [Bucket/Cart APIs](#bucketcart-apis)
6. [Medicine Store APIs](#medicine-store-apis)
7. [Error Handling](#error-handling)

---

## 🚀 Environment Setup

### Postman Environment Variables

Create a new Postman environment with these variables:

```json
{
  "name": "Pharmacy Microservices",
  "variables": [
    {
      "key": "gateway_url",
      "value": "http://localhost:3000",
      "enabled": true
    },
    {
      "key": "ocr_service_url",
      "value": "http://localhost:5000",
      "enabled": true
    },
    {
      "key": "store_service_url",
      "value": "http://localhost:5000",
      "enabled": true
    },
    {
      "key": "auth_token",
      "value": "",
      "enabled": true
    },
    {
      "key": "user_id",
      "value": "507f1f77bcf86cd799439011",
      "enabled": true
    },
    {
      "key": "prescription_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "store_id",
      "value": "507f1f77bcf86cd799439012",
      "enabled": true
    }
  ]
}
```

### Services Startup Checklist

```bash
# Terminal 1: API Gateway
cd C:\RN\Microservice-API-Gateway
npm run dev

# Terminal 2: OCR Service
cd C:\RN\PHRMA-PRODUCTION-APP-BACKEND-MAIN
npm run dev

# Terminal 3: Medical Store Service (gRPC + HTTP)
cd C:\RN\PHRMA-PRODUCTION-APP-BACKEND-MAIN-2
npm run dev
```

---

## 🔐 Authentication

### JWT Token Generation

**For Testing:** Use any valid JWT token with user data. Create a test token using this payload:

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "email": "test@example.com",
  "role": "customer"
}
```

### Postman Pre-request Script (Optional)

Add this to the pre-request script tab in Postman:

```javascript
// Use this if you have JWT_SECRET available
// const jwt = require('jsonwebtoken');
// const token = jwt.sign(
//   { _id: "507f1f77bcf86cd799439011", email: "test@example.com", role: "customer" },
//   "YOUR_JWT_SECRET",
//   { expiresIn: "120d" }
// );
// pm.environment.set("auth_token", token);

// For testing, manually set auth_token in environment variables
```

### Common Headers for All Requests

```
Content-Type: application/json
Authorization: Bearer {{auth_token}}
X-Request-ID: {{$randomUUID}}
```

---

## 📄 Prescription APIs

### 1️⃣ Upload Single Prescription Image

**Method:** `POST`  
**Route:** `{{gateway_url}}/api/prescription/upload`  
**Authentication:** Required (JWT Bearer Token)  
**Content-Type:** `multipart/form-data`

#### Request

```
Headers:
  Authorization: Bearer {{auth_token}}
  Content-Type: multipart/form-data

Body (form-data):
  Key: prescription
  Value: <select image file>
  Type: File (JPEG/PNG, max 5MB)
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Prescription uploaded successfully",
  "data": {
    "_id": "507f191e810c19729de860ea",
    "userId": "507f1f77bcf86cd799439011",
    "prescriptionCode": "RX-2026-04-30-001",
    "patientDetails": {
      "patientName": "John Doe",
      "patientAge": 35,
      "patientGender": "M",
      "patientPhone": "+91-9876543210",
      "patientEmail": "john@example.com",
      "patientAddress": {
        "street": "123 Main St",
        "city": "Mumbai",
        "state": "Maharashtra",
        "zip": "400001",
        "country": "India"
      }
    },
    "doctorName": "Dr. Rajesh Kumar",
    "doctorLicense": "MED-2019-001",
    "hospitalName": "City Medical Center",
    "hospitalContact": "+91-2226524100",
    "prescriptionDate": "2026-04-30T10:30:00Z",
    "expiryDate": "2026-05-30T10:30:00Z",
    "consultationType": "offline",
    "medicines": [
      {
        "medicineName": "Aspirin",
        "dosage": "500mg",
        "frequency": "Twice daily",
        "quantity": 30,
        "duration": "7 days",
        "sideEffects": "May cause upset stomach",
        "confidence": 95
      },
      {
        "medicineName": "Paracetamol",
        "dosage": "650mg",
        "frequency": "Three times daily",
        "quantity": 45,
        "duration": "5 days",
        "sideEffects": "Rare allergic reactions",
        "confidence": 98
      }
    ],
    "bucketCollections": [],
    "status": "active",
    "createdAt": "2026-04-30T10:30:00Z",
    "updatedAt": "2026-04-30T10:30:00Z"
  }
}
```

#### Response Error (400)

```json
{
  "success": false,
  "statusCode": 400,
  "message": "No file uploaded",
  "data": null
}
```

---

### 2️⃣ Stream Prescription Upload (Real-time Updates)

**Method:** `POST`  
**Route:** `{{gateway_url}}/api/prescription/upload-stream`  
**Authentication:** Required (JWT Bearer Token)  
**Content-Type:** `multipart/form-data`

#### Request

```
Headers:
  Authorization: Bearer {{auth_token}}
  Content-Type: multipart/form-data

Body (form-data):
  Key: prescription
  Value: <select image file>
  Type: File
```

#### Response (Server-Sent Events - SSE)

```
event: processing
data: {"status":"starting_ocr","progress":10}

event: processing
data: {"status":"extracting_text","progress":30}

event: processing
data: {"status":"parsing_medicines","progress":60}

event: processing
data: {"status":"validating_data","progress":90}

event: complete
data: {
  "success": true,
  "prescription": { ... full prescription object ... }
}
```

---

## 🔍 Search APIs

### 3️⃣ Search Medicines by Prescription (Filtered)

**Method:** `POST`  
**Route:** `{{gateway_url}}/api/search`  
**Authentication:** Required (JWT Bearer Token)  
**Content-Type:** `application/json`

#### Request

```json
{
  "prescriptionId": "507f191e810c19729de860ea",
  "userLocation": {
    "latitude": 19.0760,
    "longitude": 72.8777
  },
  "filters": {
    "maxPrice": 500,
    "maxDistance": 5,
    "availability": "in_stock",
    "storeTypes": ["pharmacy", "chemist"]
  }
}
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Search results retrieved successfully",
  "data": {
    "prescriptionId": "507f191e810c19729de860ea",
    "medicineViewData": [
      {
        "medicineName": "Aspirin",
        "dosage": "500mg",
        "averagePrice": 45,
        "priceRange": {
          "min": 40,
          "max": 55
        },
        "totalStoresAvailable": 12,
        "availableStores": [
          {
            "storeId": "507f1f77bcf86cd799439012",
            "storeName": "City Pharmacy",
            "price": 45,
            "distance": 0.8,
            "availability": "in_stock",
            "quantity": 150
          },
          {
            "storeId": "507f1f77bcf86cd799439013",
            "storeName": "Health Store Plus",
            "price": 50,
            "distance": 1.2,
            "availability": "in_stock",
            "quantity": 100
          }
        ]
      },
      {
        "medicineName": "Paracetamol",
        "dosage": "650mg",
        "averagePrice": 35,
        "priceRange": {
          "min": 30,
          "max": 45
        },
        "totalStoresAvailable": 8,
        "availableStores": [
          {
            "storeId": "507f1f77bcf86cd799439012",
            "storeName": "City Pharmacy",
            "price": 35,
            "distance": 0.8,
            "availability": "in_stock",
            "quantity": 200
          }
        ]
      }
    ],
    "storeViewData": [
      {
        "storeId": "507f1f77bcf86cd799439012",
        "storeName": "City Pharmacy",
        "distance": 0.8,
        "totalMedicinesAvailable": 2,
        "totalPrice": 80,
        "rating": 4.5,
        "reviewCount": 234,
        "openingHours": {
          "monday": "09:00-22:00",
          "tuesday": "09:00-22:00"
        },
        "medicines": [
          {
            "medicineName": "Aspirin",
            "dosage": "500mg",
            "price": 45
          },
          {
            "medicineName": "Paracetamol",
            "dosage": "650mg",
            "price": 35
          }
        ]
      }
    ],
    "userLocation": {
      "latitude": 19.0760,
      "longitude": 72.8777
    }
  }
}
```

#### Response Error (404)

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Aggregated result not found",
  "data": null
}
```

---

### 4️⃣ Global Medicine Search

**Method:** `GET`  
**Route:** `{{gateway_url}}/api/search/global`  
**Authentication:** Not Required  
**Query Parameters:**

```
q=aspirin&lat=19.0760&lng=72.8777&limit=20
```

#### Request

```
GET {{gateway_url}}/api/search/global?q=aspirin&lat=19.0760&lng=72.8777&limit=20
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Global search completed successfully",
  "data": {
    "medicines": [
      {
        "_id": "507f191e810c19729de860e1",
        "medicineName": "Aspirin",
        "formula": "C9H8O4",
        "itemCompany": "Bayer",
        "description": "Analgesic and anti-inflammatory",
        "searchScore": 0.95,
        "stores": [
          {
            "storeId": "507f1f77bcf86cd799439012",
            "storeName": "City Pharmacy",
            "price": 45,
            "distance": 0.8
          }
        ]
      }
    ],
    "stores": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "storeName": "City Pharmacy",
        "latitude": 19.0765,
        "longitude": 72.8765,
        "distance": 0.8,
        "rating": 4.5
      }
    ],
    "totalResults": 25,
    "limit": 20
  }
}
```

---

## 🛒 Bucket/Cart APIs

### 5️⃣ Get User Bucket

**Method:** `GET`  
**Route:** `{{gateway_url}}/api/bucket`  
**Authentication:** Required (JWT Bearer Token)  
**Query Parameters (Optional):**

```
prescriptionId=507f191e810c19729de860ea
```

#### Request

```
GET {{gateway_url}}/api/bucket?prescriptionId=507f191e810c19729de860ea
Headers:
  Authorization: Bearer {{auth_token}}
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Bucket retrieved successfully",
  "data": {
    "_id": "507f191e810c19729de860fb",
    "userId": "507f1f77bcf86cd799439011",
    "prescriptionId": "507f191e810c19729de860ea",
    "bucketCollections": [
      {
        "storeId": "507f1f77bcf86cd799439012",
        "storeName": "City Pharmacy",
        "storeLocation": {
          "latitude": 19.0765,
          "longitude": 72.8765
        },
        "medicines": [
          {
            "medicineId": "507f191e810c19729de860e1",
            "medicineName": "Aspirin",
            "dosage": "500mg",
            "price": 45,
            "quantity": 2,
            "subtotal": 90
          }
        ],
        "storeTotal": 90,
        "deliveryCharges": 10,
        "grandTotal": 100
      }
    ],
    "totalAmount": 100,
    "totalMedicines": 1,
    "createdAt": "2026-04-30T10:30:00Z",
    "updatedAt": "2026-04-30T10:30:00Z"
  }
}
```

---

### 6️⃣ Add Medicine to Bucket

**Method:** `POST`  
**Route:** `{{gateway_url}}/api/bucket/add`  
**Authentication:** Required (JWT Bearer Token)  
**Content-Type:** `application/json`

#### Request

```json
{
  "prescriptionId": "507f191e810c19729de860ea",
  "store": {
    "storeId": "507f1f77bcf86cd799439012",
    "storeName": "City Pharmacy",
    "storeLocation": {
      "latitude": 19.0765,
      "longitude": 72.8765
    },
    "medicines": [
      {
        "medicineId": "507f191e810c19729de860e1",
        "medicineName": "Aspirin",
        "dosage": "500mg",
        "price": 45,
        "quantity": 2
      }
    ]
  }
}
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Medicine added to bucket successfully",
  "data": {
    "_id": "507f191e810c19729de860fb",
    "userId": "507f1f77bcf86cd799439011",
    "prescriptionId": "507f191e810c19729de860ea",
    "bucketCollections": [
      {
        "storeId": "507f1f77bcf86cd799439012",
        "storeName": "City Pharmacy",
        "medicines": [
          {
            "medicineId": "507f191e810c19729de860e1",
            "medicineName": "Aspirin",
            "price": 45,
            "quantity": 2,
            "subtotal": 90
          }
        ],
        "storeTotal": 90,
        "grandTotal": 100
      }
    ],
    "totalAmount": 100
  }
}
```

---

### 7️⃣ Remove Medicine from Bucket

**Method:** `POST`  
**Route:** `{{gateway_url}}/api/bucket/remove`  
**Authentication:** Required (JWT Bearer Token)  
**Content-Type:** `application/json`

#### Request

```json
{
  "prescriptionId": "507f191e810c19729de860ea",
  "storeId": "507f1f77bcf86cd799439012",
  "medicineId": "507f191e810c19729de860e1"
}
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Medicine removed from bucket successfully",
  "data": {
    "_id": "507f191e810c19729de860fb",
    "userId": "507f1f77bcf86cd799439011",
    "prescriptionId": "507f191e810c19729de860ea",
    "bucketCollections": [],
    "totalAmount": 0
  }
}
```

---

## 🏪 Medicine Store APIs

### 8️⃣ Get All Stores

**Method:** `GET`  
**Route:** `{{gateway_url}}/v2/medicine-store/all`  
**Authentication:** Not Required  
**Query Parameters (Optional):**

```
latitude=19.0760&longitude=72.8777&radius=10
```

#### Request

```
GET {{gateway_url}}/v2/medicine-store/all?latitude=19.0760&longitude=72.8777&radius=10
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "All stores retrieved successfully",
  "data": {
    "stores": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "storeName": "City Pharmacy",
        "ownerName": "Rajesh Kumar",
        "storeLogo": "https://cdn.example.com/logo1.jpg",
        "storePhotoUrl": "https://cdn.example.com/store1.jpg",
        "address": {
          "street": "456 Medical Road",
          "city": "Mumbai",
          "state": "Maharashtra",
          "zip": "400002",
          "country": "India",
          "latitude": 19.0765,
          "longitude": 72.8765
        },
        "contact": {
          "phone": "+91-2226524100",
          "email": "contact@citypharmacy.com",
          "alternatePhone": "+91-9876543210"
        },
        "operatingHours": {
          "monday": "09:00-22:00",
          "tuesday": "09:00-22:00",
          "wednesday": "09:00-22:00",
          "thursday": "09:00-22:00",
          "friday": "09:00-22:00",
          "saturday": "09:00-23:00",
          "sunday": "10:00-21:00"
        },
        "isActive": true,
        "licenseNumber": "MED-2019-001",
        "rating": 4.5,
        "reviewCount": 234,
        "distance": 0.8,
        "deliveryAvailable": true
      }
    ],
    "totalStores": 45
  }
}
```

---

### 9️⃣ Get Store Details

**Method:** `GET`  
**Route:** `{{gateway_url}}/v2/medicine-store/:storeId`  
**Authentication:** Not Required  
**URL Parameters:**

```
storeId: 507f1f77bcf86cd799439012
```

#### Request

```
GET {{gateway_url}}/v2/medicine-store/507f1f77bcf86cd799439012
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Store details retrieved successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "storeName": "City Pharmacy",
    "ownerName": "Rajesh Kumar",
    "storeLogo": "https://cdn.example.com/logo1.jpg",
    "storePhotoUrl": "https://cdn.example.com/store1.jpg",
    "description": "Premium pharmacy with licensed pharmacists",
    "address": {
      "street": "456 Medical Road",
      "city": "Mumbai",
      "state": "Maharashtra",
      "zip": "400002",
      "latitude": 19.0765,
      "longitude": 72.8765
    },
    "contact": {
      "phone": "+91-2226524100",
      "email": "contact@citypharmacy.com"
    },
    "operatingHours": {
      "monday": "09:00-22:00",
      "sunday": "10:00-21:00"
    },
    "isActive": true,
    "licenseNumber": "MED-2019-001",
    "rating": 4.5,
    "reviewCount": 234,
    "totalMedicinesInStock": 1250,
    "acceptsPrescription": true,
    "deliveryAvailable": true,
    "createdAt": "2026-01-15T10:30:00Z"
  }
}
```

---

### 🔟 Get Store Items/Medicines

**Method:** `GET`  
**Route:** `{{gateway_url}}/v2/medicine-store/:storeId/items`  
**Authentication:** Required (JWT Bearer Token)  
**Query Parameters (Optional):**

```
category=pain-relief&inStock=true&limit=20&offset=0&search=aspirin
```

#### Request

```
GET {{gateway_url}}/v2/medicine-store/507f1f77bcf86cd799439012/items?category=pain-relief&inStock=true&limit=20
Headers:
  Authorization: Bearer {{auth_token}}
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Store items retrieved successfully",
  "data": {
    "storeId": "507f1f77bcf86cd799439012",
    "storeName": "City Pharmacy",
    "items": [
      {
        "_id": "507f191e810c19729de860e1",
        "itemName": "Aspirin",
        "formula": "C9H8O4",
        "itemCompany": "Bayer",
        "itemFinalPrice": 45,
        "category": "pain-relief",
        "description": "Effective for headaches and body pain",
        "stockStatus": "in_stock",
        "quantity": 150,
        "expiryDate": "2027-12-31",
        "batchNumber": "BATCH-2026-001",
        "strength": "500mg",
        "packSize": "10 tablets",
        "prescription_required": false
      },
      {
        "_id": "507f191e810c19729de860e2",
        "itemName": "Paracetamol",
        "formula": "C8H9NO2",
        "itemCompany": "GlaxoSmithKline",
        "itemFinalPrice": 35,
        "category": "fever-reducer",
        "description": "Safe fever and pain management",
        "stockStatus": "in_stock",
        "quantity": 200,
        "expiryDate": "2027-06-30",
        "batchNumber": "BATCH-2026-002",
        "strength": "650mg",
        "packSize": "15 tablets",
        "prescription_required": false
      }
    ],
    "totalItems": 2,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 1️⃣1️⃣ Search Medicines in Store

**Method:** `GET`  
**Route:** `{{gateway_url}}/v2/medicine-store/:storeId/items/search`  
**Authentication:** Required (JWT Bearer Token)  
**Query Parameters:**

```
q=aspirin&maxPrice=100
```

#### Request

```
GET {{gateway_url}}/v2/medicine-store/507f1f77bcf86cd799439012/items/search?q=aspirin&maxPrice=100
Headers:
  Authorization: Bearer {{auth_token}}
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Search completed successfully",
  "data": {
    "searchQuery": "aspirin",
    "filters": {
      "maxPrice": 100
    },
    "results": [
      {
        "_id": "507f191e810c19729de860e1",
        "itemName": "Aspirin",
        "itemFinalPrice": 45,
        "stockStatus": "in_stock",
        "quantity": 150,
        "matchScore": 0.98
      }
    ],
    "totalResults": 1
  }
}
```

---

### 1️⃣2️⃣ Get Store Review Stats

**Method:** `GET`  
**Route:** `{{gateway_url}}/v2/medicine-store/:storeId/review-stats`  
**Authentication:** Not Required

#### Request

```
GET {{gateway_url}}/v2/medicine-store/507f1f77bcf86cd799439012/review-stats
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Review stats retrieved successfully",
  "data": {
    "storeId": "507f1f77bcf86cd799439012",
    "storeName": "City Pharmacy",
    "totalReviews": 234,
    "averageRating": 4.5,
    "ratingDistribution": {
      "5": 180,
      "4": 35,
      "3": 15,
      "2": 3,
      "1": 1
    },
    "topReviews": [
      {
        "userId": "507f191e810c19729de860ea",
        "userName": "Amit Sharma",
        "rating": 5,
        "comment": "Excellent service and quality medicines",
        "createdAt": "2026-04-29T15:30:00Z"
      }
    ]
  }
}
```

---

### 1️⃣3️⃣ Get Available Medicines in Store

**Method:** `GET`  
**Route:** `{{gateway_url}}/v2/medicine-store/:storeId/items/available`  
**Authentication:** Required (JWT Bearer Token)

#### Request

```
GET {{gateway_url}}/v2/medicine-store/507f1f77bcf86cd799439012/items/available
Headers:
  Authorization: Bearer {{auth_token}}
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Available medicines retrieved successfully",
  "data": {
    "storeId": "507f1f77bcf86cd799439012",
    "availableMedicines": [
      {
        "_id": "507f191e810c19729de860e1",
        "itemName": "Aspirin",
        "itemFinalPrice": 45,
        "quantity": 150,
        "stockStatus": "in_stock"
      }
    ],
    "totalAvailable": 1,
    "lastUpdated": "2026-04-30T10:30:00Z"
  }
}
```

---

### 1️⃣4️⃣ Give Store Review

**Method:** `POST`  
**Route:** `{{gateway_url}}/v2/medicine-store/:storeId/review`  
**Authentication:** Required (JWT Bearer Token)  
**Content-Type:** `application/json`

#### Request

```json
{
  "rating": 5,
  "comment": "Excellent service and quality medicines",
  "prescriptionOrderId": "507f191e810c19729de860ea"
}
```

#### Response Success (201)

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Review submitted successfully",
  "data": {
    "_id": "507f191e810c19729de860fc",
    "storeId": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "rating": 5,
    "comment": "Excellent service and quality medicines",
    "createdAt": "2026-04-30T10:30:00Z"
  }
}
```

---

### 1️⃣5️⃣ Get Store Opening Hours

**Method:** `GET`  
**Route:** `{{gateway_url}}/v2/medicine-store/:storeId/hours`  
**Authentication:** Not Required

#### Request

```
GET {{gateway_url}}/v2/medicine-store/507f1f77bcf86cd799439012/hours
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Store hours retrieved successfully",
  "data": {
    "storeId": "507f1f77bcf86cd799439012",
    "storeName": "City Pharmacy",
    "operatingHours": {
      "monday": "09:00-22:00",
      "tuesday": "09:00-22:00",
      "wednesday": "09:00-22:00",
      "thursday": "09:00-22:00",
      "friday": "09:00-22:00",
      "saturday": "09:00-23:00",
      "sunday": "10:00-21:00"
    },
    "isCurrentlyOpen": true,
    "closingTime": "22:00",
    "timeZone": "IST"
  }
}
```

---

### 1️⃣6️⃣ Get Store Inventory Status

**Method:** `GET`  
**Route:** `{{gateway_url}}/v2/medicine-store/:storeId/inventory-status`  
**Authentication:** Not Required

#### Request

```
GET {{gateway_url}}/v2/medicine-store/507f1f77bcf86cd799439012/inventory-status
```

#### Response Success (200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Inventory status retrieved successfully",
  "data": {
    "storeId": "507f1f77bcf86cd799439012",
    "storeName": "City Pharmacy",
    "totalMedicinesInStock": 1250,
    "totalMedicinesOutOfStock": 45,
    "totalCategories": 28,
    "categoryStatus": [
      {
        "category": "pain-relief",
        "inStock": 156,
        "outOfStock": 3
      },
      {
        "category": "fever-reducer",
        "inStock": 200,
        "outOfStock": 1
      }
    ],
    "lastUpdated": "2026-04-30T10:30:00Z"
  }
}
```

---

## ⚠️ Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "data": null
}
```

### Common Error Codes

| Status Code | Message | Reason |
|------------|---------|--------|
| 400 | Bad Request | Missing or invalid parameters |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | User lacks permission (not store owner) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate entry or data conflict |
| 500 | Internal Server Error | Server-side error |

### Example Error Responses

#### 401 - Missing Authentication

```json
{
  "success": false,
  "statusCode": 401,
  "message": "No authorization token provided",
  "data": null
}
```

#### 404 - Prescription Not Found

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Prescription not found",
  "data": null
}
```

#### 400 - Validation Error

```json
{
  "success": false,
  "statusCode": 400,
  "message": "prescriptionId is required",
  "data": null
}
```

---

## 📊 Testing Workflow

### Recommended Testing Order

1. **Get Store Details** (No Auth)
2. **Get All Stores** (No Auth)
3. **Upload Prescription** (Auth Required)
   - Save the `prescriptionId` to environment
4. **Search Medicines by Prescription** (Auth Required)
   - Use prescription ID from step 3
5. **Add Medicine to Bucket** (Auth Required)
6. **Get Bucket** (Auth Required)
7. **Search Store Medicines** (Auth Required)
8. **Give Store Review** (Auth Required)

---

## 🔌 Internal gRPC Communication (Reference Only)

**Note:** gRPC is internal communication only, NOT exposed to Postman.

### gRPC Service: GetStoreAvailability

**Protocol Buffer Contract:**

```protobuf
syntax = "proto3";

service StoreService {
  rpc GetStoreAvailability(StoreRequest) returns (StoreResponse);
}

message StoreRequest {
  repeated string medicines = 1;
  double latitude = 2;
  double longitude = 3;
  double radiusKm = 4;
}

message StoreResponse {
  repeated StoreAvailability availability = 1;
}

message StoreAvailability {
  string storeId = 1;
  string storeName = 2;
  string medicineName = 3;
  double price = 4;
  bool availability = 5;
  double distance = 6;
}
```

---

## 🚨 Important Notes

### API Gateway Behavior

- All `/api/prescription/*` routes proxy to OCR Service (localhost:5000)
- All `/api/search/*` routes proxy to OCR Service (localhost:5000)
- All `/v2/medicine-store/*` routes proxy to Store Service (localhost:5000)
- Public routes in gateway are **NOT** require JWT authentication
- Protected routes require valid JWT in `Authorization: Bearer <token>` header

### JWT Token Details

```
Header: {
  "alg": "HS256",
  "typ": "JWT"
}

Payload: {
  "_id": "507f1f77bcf86cd799439011",
  "email": "test@example.com",
  "role": "customer",
  "iat": 1704067200,
  "exp": 1851753600
}

Secret: YOUR_JWT_SECRET (set in .env files)
```

### gRPC Communication

- **Endpoint:** `localhost:50051`
- **Protocol:** gRPC/HTTP2
- **Authentication:** Internal service-to-service only
- **Timeout:** 5 seconds default
- **Retries:** Auto-retry on `UNAVAILABLE` status

### Performance Considerations

- Prescription upload supports streaming for real-time progress
- Search results are cached in Redis (30-minute TTL)
- Images are optimized to max 1200px width before OCR
- Batch operations limit: max 50 items per request

---

## 📚 Additional Resources

- **API Gateway:** `c:\RN\Microservice-API-Gateway`
- **OCR Service:** `c:\RN\PHRMA-PRODUCTION-APP-BACKEND-MAIN`
- **Store Service:** `c:\RN\PHRMA-PRODUCTION-APP-BACKEND-MAIN-2`
- **Proto Files:** `c:\RN\PHRMA-PRODUCTION-APP-BACKEND-MAIN\proto\store.proto`

---

## 🎯 Troubleshooting

### Issue: 401 Unauthorized

**Solution:** Ensure `Authorization: Bearer <token>` header is present and token is valid.

### Issue: 404 Not Found on Search

**Solution:** Prescription must exist first. Upload prescription and wait for aggregation to complete (check Redis cache).

### Issue: gRPC Connection Error

**Solution:** Ensure Medical Store Service is running on port 50051. Check logs for binding errors.

### Issue: Image Upload Fails

**Solution:** Ensure file size < 5MB and format is JPEG/PNG. Multipart form-data must be set correctly.

---

**Last Updated:** April 30, 2026  
**Version:** 1.0.0
