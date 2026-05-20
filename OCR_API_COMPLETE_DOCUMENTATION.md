# 🩺 OCR API Complete Documentation

## 📋 Overview

The OCR (Optical Character Recognition) API processes prescription images and extracts medicine information using advanced image recognition and medical text analysis. This document provides complete request/response examples for frontend integration.

**Base URL:** `http://localhost:5000/api` (or your API Gateway: `http://localhost:3000/api`)

---

## 🔐 Authentication

All OCR endpoints require JWT Bearer token authentication.

### Headers Required
```
Content-Type: multipart/form-data
Authorization: Bearer <JWT_TOKEN>
```

---

## 📌 API Endpoints

---

## 1️⃣ **Standard Upload** - Wait for Complete Response

### Endpoint
```
POST /prescription/upload
```

### Purpose
Upload a single prescription image and get complete OCR extraction results in one response.

### Request

#### Headers
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data
```

#### Body (Form Data)
```
prescription: [IMAGE_FILE]  (JPEG/PNG, max 5MB)
```

#### cURL Example
```bash
curl -X POST "http://localhost:5000/api/prescription/upload" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "prescription=@/path/to/prescription.jpg"
```

#### JavaScript/Frontend Example
```javascript
const formData = new FormData();
formData.append('prescription', fileInput.files[0]);

const response = await fetch('http://localhost:5000/api/prescription/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const data = await response.json();
console.log(data);
```

### Response Success (200 OK)

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
      "patientGender": "Male",
      "patientPhone": "+91-9876543210",
      "patientEmail": "john@example.com",
      "patientAddress": {
        "street": "123 Main Street",
        "city": "Mumbai",
        "state": "Maharashtra",
        "zip": "400001",
        "country": "India"
      }
    },
    "doctorName": "Dr. Rajesh Kumar",
    "doctorLicense": "MED-2019-001",
    "doctorSpecialization": "General Medicine",
    "hospitalName": "City Medical Center",
    "hospitalContact": "+91-2226524100",
    "hospitalAddress": "456 Medical Park, Mumbai",
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
        "confidence": 95,
        "strength": "500mg",
        "formulation": "Tablet"
      },
      {
        "medicineName": "Paracetamol",
        "dosage": "650mg",
        "frequency": "Three times daily",
        "quantity": 45,
        "duration": "5 days",
        "sideEffects": "Rare allergic reactions",
        "confidence": 98,
        "strength": "650mg",
        "formulation": "Tablet"
      },
      {
        "medicineName": "Amoxicillin",
        "dosage": "250mg",
        "frequency": "Twice daily",
        "quantity": 20,
        "duration": "7 days",
        "sideEffects": "Possible diarrhea",
        "confidence": 92,
        "strength": "250mg",
        "formulation": "Capsule"
      }
    ],
    "diagnosticTests": [
      "Blood Test (CBC)",
      "X-Ray Chest",
      "ECG"
    ],
    "diagnoses": [
      "Fever",
      "Cough",
      "Mild Bronchitis"
    ],
    "vitalSigns": [
      {
        "parameter": "Temperature",
        "value": "101.5°F",
        "status": "elevated"
      },
      {
        "parameter": "Blood Pressure",
        "value": "120/80",
        "status": "normal"
      }
    ],
    "notes": "Patient should avoid dairy products while on antibiotics",
    "followUpDate": "2026-05-07T10:30:00Z",
    "bucketCollections": [
      {
        "storeId": "507f1f77bcf86cd799439012",
        "storeName": "Apollo Pharmacy",
        "storeLocation": "123 Main St, Mumbai",
        "medicines": [
          {
            "medicineName": "Aspirin",
            "price": 45.00,
            "discount": 10,
            "availability": "in_stock",
            "quantity": 2
          }
        ]
      }
    ],
    "status": "active",
    "validationScore": 95,
    "ocrConfidenceLevel": "high",
    "processingTime": 3250,
    "createdAt": "2026-04-30T10:30:00Z",
    "updatedAt": "2026-04-30T10:30:00Z"
  }
}
```

### Response Error (400) - Invalid Prescription

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid prescription or non-medical image detected",
  "data": {
    "details": {
      "message": "No medicines detected. Expected at least 1, found 0",
      "confidence": 45,
      "medicinesDetected": 0,
      "reasons": [
        "No text extracted from image",
        "No medical keywords found"
      ]
    }
  }
}
```

### Response Error (400) - No File

```json
{
  "success": false,
  "statusCode": 400,
  "message": "No prescription image provided",
  "data": null
}
```

### Response Error (413) - File Too Large

```json
{
  "success": false,
  "statusCode": 413,
  "message": "File size exceeds maximum limit (5MB)",
  "data": null
}
```

### Response Error (401) - Unauthorized

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized - Invalid or missing token",
  "data": null
}
```

---

## 2️⃣ **Streaming Upload** - Real-Time Updates (SSE)

### Endpoint
```
POST /prescription/upload-stream
```

### Purpose
Upload prescription image and receive real-time progress updates via Server-Sent Events (SSE). Perfect for showing progress bars and live updates to users.

### Request

#### Headers
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data
```

#### Body (Form Data)
```
prescription: [IMAGE_FILE]  (JPEG/PNG, max 5MB)
```

#### JavaScript/Frontend Example
```javascript
const eventSource = new EventSource('/api/prescription/upload-stream');

eventSource.addEventListener('status', (event) => {
  const data = JSON.parse(event.data);
  console.log('Status:', data);
  // Update progress bar: data.progress (0-100)
  updateProgressBar(data.progress);
});

eventSource.addEventListener('ocr_chunk', (event) => {
  const data = JSON.parse(event.data);
  console.log('Medicine detected:', data.text);
  // Show real-time extracted medicine name
  addToMedicineList(data.text);
});

eventSource.addEventListener('medicine_item', (event) => {
  const data = JSON.parse(event.data);
  console.log('Medicine enriched:', data.medicine);
  // Show enriched medicine with price/availability
});

eventSource.addEventListener('medicines_found', (event) => {
  const data = JSON.parse(event.data);
  console.log('All medicines:', data.medicines);
  // Display final list
});

eventSource.addEventListener('complete', (event) => {
  const response = JSON.parse(event.data);
  console.log('Complete response:', response);
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Stream error:', event);
  eventSource.close();
});
```

### Response Stream Events (SSE)

#### Event 1: Status - OCR Starting
```
event: status
data: {"status":"starting_ocr","progress":5,"message":"Initializing OCR engine..."}
```

#### Event 2: Status - Extracting Text
```
event: status
data: {"status":"extracting_text","progress":30,"message":"Reading prescription text..."}
```

#### Event 3: OCR Chunk - Medicine Name
```
event: ocr_chunk
data: {"text":"Aspirin"}
```

#### Event 4: OCR Chunk - Another Medicine
```
event: ocr_chunk
data: {"text":"Paracetamol"}
```

#### Event 5: Medicine Item - Enriched Data
```
event: medicine_item
data: {
  "event":"medicine_item",
  "medicine":{
    "drugName":"Aspirin",
    "dosage":"500mg",
    "frequency":"Twice daily",
    "duration":"7 days",
    "price":45.00,
    "availability":true,
    "confidence":95
  }
}
```

#### Event 6: Final Summary
```
event: medicines_found
data: {
  "event":"medicines_found",
  "medicines":[
    {
      "drugName":"Aspirin",
      "dosage":"500mg",
      "frequency":"Twice daily",
      "duration":"7 days",
      "price":45.00,
      "availability":true
    },
    {
      "drugName":"Paracetamol",
      "dosage":"650mg",
      "frequency":"Three times daily",
      "duration":"5 days",
      "price":65.00,
      "availability":true
    }
  ]
}
```

#### Event 7: Complete Success
```
event: complete
data: {
  "success":true,
  "statusCode":200,
  "message":"Prescription processed successfully",
  "data":{...complete prescription object...}
}
```

---

## 🔍 OCR Result Structure

### Medicine Object
```json
{
  "medicineName": "Aspirin",
  "dosage": "500mg",
  "frequency": "Twice daily",
  "duration": "7 days",
  "quantity": 30,
  "strength": "500mg",
  "formulation": "Tablet",
  "sideEffects": "May cause upset stomach",
  "confidence": 95
}
```

### Patient Details Object
```json
{
  "patientName": "John Doe",
  "patientAge": 35,
  "patientGender": "Male",
  "patientPhone": "+91-9876543210",
  "patientEmail": "john@example.com",
  "patientAddress": {
    "street": "123 Main Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "zip": "400001",
    "country": "India"
  }
}
```

### Doctor Details Object
```json
{
  "doctorName": "Dr. Rajesh Kumar",
  "doctorLicense": "MED-2019-001",
  "doctorSpecialization": "General Medicine",
  "hospitalName": "City Medical Center",
  "hospitalContact": "+91-2226524100",
  "hospitalAddress": "456 Medical Park, Mumbai"
}
```

---

## ⚠️ Error Response Format

### Standard Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "data": {
    "details": {
      "message": "Detailed error message",
      "confidence": 45,
      "medicinesDetected": 0,
      "reasons": [
        "Reason 1",
        "Reason 2"
      ]
    }
  }
}
```

### Common Error Codes

| Code | Message | Reason |
|------|---------|--------|
| 400 | No prescription image provided | File is missing |
| 400 | Invalid prescription or non-medical image detected | Image is not a prescription |
| 400 | No medicines detected | OCR couldn't find medicine information |
| 401 | Unauthorized | Invalid or missing JWT token |
| 413 | File size exceeds maximum limit | File > 5MB |
| 415 | Unsupported file type | Not JPEG/PNG format |
| 422 | OCR processing failed | Technical error during processing |
| 500 | Internal server error | Server error |

---

## 🎯 Frontend Integration Examples

### React Example
```jsx
import React, { useState } from 'react';

function OCRUploader() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('prescription', file);

    try {
      const response = await fetch(
        'http://localhost:5000/api/prescription/upload',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      setResult(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input 
        type="file" 
        accept="image/*" 
        onChange={(e) => setFile(e.target.files[0])}
      />
      <button onClick={handleUpload} disabled={loading || !file}>
        {loading ? 'Processing...' : 'Upload Prescription'}
      </button>

      {error && <div style={{color: 'red'}}>{error}</div>}
      
      {result && (
        <div>
          <h3>Medicines Found:</h3>
          {result.medicines.map((med, idx) => (
            <div key={idx}>
              <p>{med.medicineName} - {med.dosage}</p>
              <p>Frequency: {med.frequency}</p>
              <p>Duration: {med.duration}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OCRUploader;
```

### Vue Example
```vue
<template>
  <div>
    <input 
      type="file" 
      ref="fileInput" 
      accept="image/*"
      @change="handleFileSelect"
    />
    <button @click="uploadPrescription" :disabled="!file || loading">
      {{ loading ? 'Processing...' : 'Upload' }}
    </button>

    <div v-if="error" class="error">{{ error }}</div>
    
    <div v-if="result" class="result">
      <h3>Medicines:</h3>
      <div v-for="(med, idx) in result.medicines" :key="idx">
        <p><strong>{{ med.medicineName }}</strong> - {{ med.dosage }}</p>
        <p>{{ med.frequency }} for {{ med.duration }}</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      file: null,
      loading: false,
      result: null,
      error: null
    };
  },
  methods: {
    handleFileSelect(e) {
      this.file = e.target.files[0];
    },
    async uploadPrescription() {
      if (!this.file) return;

      this.loading = true;
      this.error = null;

      const formData = new FormData();
      formData.append('prescription', this.file);

      try {
        const response = await fetch(
          'http://localhost:5000/api/prescription/upload',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message);
        }

        this.result = data.data;
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>
```

---

## 🔄 OCR Validation Details

The API validates extracted prescription data against:

### Validation Criteria
✅ **Text Extraction:** Must have extracted text  
✅ **Medicines:** Must detect at least 1 medicine  
✅ **Confidence:** Must be ≥ 50%  
✅ **Medical Keywords:** Must contain keywords like: mg, ml, tablet, capsule, daily, etc.  
✅ **Dosage Patterns:** Must match patterns like "500mg", "2 tablets", etc.

### Validation Failure Response
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid prescription or non-medical image detected",
  "data": {
    "details": {
      "message": "No medicines detected. Expected at least 1, found 0",
      "confidence": 45,
      "medicinesDetected": 0,
      "reasons": [
        "No medicines detected",
        "No medical keywords found",
        "Low confidence score"
      ]
    }
  }
}
```

---

## 📊 Confidence Score Interpretation

| Score | Interpretation | Action |
|-------|-----------------|--------|
| 90-100 | Very High | ✅ Accept immediately |
| 75-89 | High | ✅ Accept |
| 50-74 | Medium | ⚠️ Show warning but allow |
| < 50 | Low | ❌ Reject |

---

## 🚀 Best Practices for Frontend

### 1. **Image Quality Checks**
```javascript
// Before upload
- Check file size < 5MB
- Verify JPEG/PNG format
- Show preview to user
```

### 2. **Handle Streaming vs Standard**
```javascript
// Use streaming for better UX
- Show real-time progress
- Display found medicines as they appear
- More responsive to user
```

### 3. **Error Handling**
```javascript
try {
  // Upload
} catch (error) {
  if (error.response.status === 400) {
    // Show: "Not a valid prescription"
  } else if (error.response.status === 401) {
    // Show: "Login required"
  } else if (error.response.status === 413) {
    // Show: "File too large"
  }
}
```

### 4. **Retry Logic**
```javascript
// Implement exponential backoff
- First retry: 1 second
- Second retry: 2 seconds
- Third retry: 4 seconds
```

---

## 🧪 Testing with cURL

### Basic Upload Test
```bash
curl -X POST http://localhost:5000/api/prescription/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "prescription=@prescription.jpg"
```

### With Response Headers
```bash
curl -v -X POST http://localhost:5000/api/prescription/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "prescription=@prescription.jpg" \
  | jq '.'
```

---

## 📝 Notes

- All timestamps are in ISO 8601 format (UTC)
- Confidence scores are 0-100 percentage
- Processing time varies based on image quality (2-10 seconds)
- Prescription codes are unique and follow format: `RX-YYYY-MM-DD-XXX`
- Images are optimized before OCR (resized to max 1200px, compressed)

---

## ✅ Checklist for Frontend Implementation

- [ ] Add file input with validation
- [ ] Show progress indicator during upload
- [ ] Display extracted medicines in readable format
- [ ] Show confidence scores
- [ ] Handle all error cases with user-friendly messages
- [ ] Implement retry logic for failed uploads
- [ ] Cache authorization token securely
- [ ] Test with various prescription images
- [ ] Implement proper error boundaries
- [ ] Add loading states and spinners

---

**Last Updated:** May 15, 2026  
**API Version:** 1.0.0  
**Status:** Production Ready ✅
