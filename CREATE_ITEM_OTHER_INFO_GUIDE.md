# Create Item API - otherInformation Usage Guide

## ✅ Implementation Complete

The `createItem` and `createPremiumItem` APIs now fully support the `otherInformation` object with all required fields.

---

## 📋 Request Format

### **Endpoint:** `POST /api/items/create`

### **Content-Type:** `multipart/form-data` or `application/json`

---

## 📝 Example 1: JSON Request

```json
{
  "itemName": "Dolo 650 Tablet",
  "itemInitialPrice": 30,
  "itemDescription": "Pain relief and fever reducer",
  "itemCategory": "64f8a2b3c9e1234567890abc",
  "itemMfgDate": "2024-01-15",
  "itemExpiryDate": "2026-01-15",
  "itemChildUnit": "64f8a2b3c9e1234567890xyz",
  "itemGST": "64f8a2b3c9e1234567890gst",
  "code": "DOLO650",
  "HSNCode": "30049011",
  "weight": "10g",
  "otherInformation": {
    "keyFeatures": [
      "Fast pain relief",
      "Reduces fever effectively",
      "Doctor recommended"
    ],
    "benefits": [
      "Quick action within 30 minutes",
      "Safe for adults and children above 12",
      "Long-lasting relief up to 6 hours"
    ],
    "precautions": [
      "Do not exceed recommended dose",
      "Consult doctor if pregnant",
      "Keep out of reach of children"
    ],
    "allergyInfo": [
      "Contains Paracetamol",
      "Not suitable for liver patients"
    ],
    "sideEffects": [
      "Nausea (rare)",
      "Allergic reactions (very rare)",
      "Stomach upset (uncommon)"
    ],
    "howToUse": "Take 1 tablet with water after meals. Do not exceed 3 tablets in 24 hours.",
    "safetyAdvice": [
      "Avoid alcohol consumption",
      "Do not drive if drowsy",
      "Store in cool dry place"
    ],
    "ingredients": [
      "Paracetamol 650mg",
      "Starch",
      "Povidone",
      "Talc"
    ]
  }
}
```

---

## 📝 Example 2: Form-Data Request (Postman/Thunder Client)

```
KEY                     VALUE
------------------      ----------------------------------
itemName                Crocin Advance Tablet
itemInitialPrice        25
itemDescription         Fast pain relief medication
itemCategory            64f8a2b3c9e1234567890abc
itemMfgDate             2024-02-01
itemExpiryDate          2026-02-01
itemChildUnit           64f8a2b3c9e1234567890xyz
itemGST                 64f8a2b3c9e1234567890gst
code                    CROCIN-ADV
HSNCode                 30049011
weight                  15g
itemImages              [File Upload]

otherInformation        {"keyFeatures":["Quick relief","Trusted brand"],"benefits":["Fast action","Long lasting"],"precautions":["Consult doctor"],"allergyInfo":["Paracetamol"],"sideEffects":["Nausea"],"howToUse":"Take 1-2 tablets","safetyAdvice":["Avoid alcohol"],"ingredients":["Paracetamol 500mg"]}
```

**Note:** When using form-data, `otherInformation` should be sent as a **JSON string**.

---

## 📝 Example 3: Minimal Request (Optional Fields)

```json
{
  "itemName": "Aspirin",
  "itemInitialPrice": 15,
  "itemCategory": "64f8a2b3c9e1234567890abc",
  "itemMfgDate": "2024-03-01",
  "itemExpiryDate": "2026-03-01",
  "itemChildUnit": "64f8a2b3c9e1234567890xyz",
  "itemGST": "64f8a2b3c9e1234567890gst",
  "code": "ASP100",
  "HSNCode": "30049012",
  "weight": "5g",
  "otherInformation": {
    "keyFeatures": ["Pain relief"],
    "howToUse": "Take 1 tablet daily"
  }
}
```

---

## 🎯 Field Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **keyFeatures** | `string[]` | No | Key features/highlights of the product |
| **benefits** | `string[]` | No | Benefits of using the product |
| **precautions** | `string[]` | No | Safety precautions and warnings |
| **allergyInfo** | `string[]` | No | Allergy information and warnings |
| **sideEffects** | `string[]` | No | Possible side effects |
| **howToUse** | `string` | No | Usage instructions |
| **safetyAdvice** | `string[]` | No | Safety advice and tips |
| **ingredients** | `string[]` | No | List of ingredients/composition |

---

## ✅ Response Format

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Item created successfully",
  "data": {
    "item": {
      "_id": "64f8a2b3c9e1234567890new",
      "itemName": "Dolo 650 Tablet",
      "itemInitialPrice": 30,
      "itemFinalPrice": 33.6,
      "itemDescription": "Pain relief and fever reducer",
      "itemImages": ["https://cloudinary.com/image1.jpg"],
      "itemCategory": "64f8a2b3c9e1234567890abc",
      "otherInformation": {
        "keyFeatures": [
          "Fast pain relief",
          "Reduces fever effectively",
          "Doctor recommended"
        ],
        "benefits": [
          "Quick action within 30 minutes",
          "Safe for adults and children above 12",
          "Long-lasting relief up to 6 hours"
        ],
        "precautions": [
          "Do not exceed recommended dose",
          "Consult doctor if pregnant",
          "Keep out of reach of children"
        ],
        "allergyInfo": [
          "Contains Paracetamol",
          "Not suitable for liver patients"
        ],
        "sideEffects": [
          "Nausea (rare)",
          "Allergic reactions (very rare)",
          "Stomach upset (uncommon)"
        ],
        "howToUse": "Take 1 tablet with water after meals. Do not exceed 3 tablets in 24 hours.",
        "safetyAdvice": [
          "Avoid alcohol consumption",
          "Do not drive if drowsy",
          "Store in cool dry place"
        ],
        "ingredients": [
          "Paracetamol 650mg",
          "Starch",
          "Povidone",
          "Talc"
        ]
      },
      "code": "DOLO650",
      "HSNCode": "30049011",
      "weight": "10g",
      "createdAt": "2024-12-12T10:30:00.000Z"
    },
    "priceVerification": {
      "status": "approved",
      "systemFinalMRP": 35,
      "userEnteredPrice": 33.6
    }
  }
}
```

---

## 🔧 How It Works

### **Step 1: Extract Data**
```typescript
const { otherInformation } = req.body;
```

### **Step 2: Parse & Validate**
```typescript
const info = typeof otherInformation === 'string' 
  ? JSON.parse(otherInformation) 
  : otherInformation;
```

### **Step 3: Process Arrays**
```typescript
if (info.keyFeatures) {
  processedOtherInfo.keyFeatures = Array.isArray(info.keyFeatures) 
    ? info.keyFeatures 
    : [info.keyFeatures];
}
```

### **Step 4: Store in Database**
```typescript
const newItemData = {
  // ... other fields
  otherInformation: processedOtherInfo
};
```

---

## 🎨 Frontend Integration Examples

### **React/Next.js Example**

```typescript
const createItem = async (formData: any) => {
  const response = await fetch('/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemName: formData.name,
      itemInitialPrice: formData.price,
      // ... other fields
      otherInformation: {
        keyFeatures: formData.features.split(',').map(f => f.trim()),
        benefits: formData.benefits.split(',').map(b => b.trim()),
        howToUse: formData.usage,
        ingredients: formData.ingredients.split(',').map(i => i.trim())
      }
    })
  });
  return response.json();
};
```

### **Postman Test**

```javascript
// Pre-request Script
pm.environment.set("itemName", "Test Medicine");

// Test Script
pm.test("Item created successfully", function() {
  pm.response.to.have.status(201);
  pm.expect(pm.response.json().data.item).to.have.property('otherInformation');
});
```

---

## 🚨 Common Errors & Solutions

### **Error 1: JSON Parse Error**
```
Error: "Unexpected token in JSON"
```
**Solution:** Ensure `otherInformation` is valid JSON string in form-data.

### **Error 2: Empty Arrays**
```
otherInformation: { keyFeatures: [] }
```
**Solution:** Arrays default to `[]`, this is expected behavior.

### **Error 3: Type Mismatch**
```
otherInformation.howToUse should be string, not array
```
**Solution:** Check schema - `howToUse` is string, others are arrays.

---

## ✅ Testing Checklist

- [ ] Create item with all otherInformation fields
- [ ] Create item with partial otherInformation
- [ ] Create item without otherInformation (should work)
- [ ] Send keyFeatures as string (should convert to array)
- [ ] Send keyFeatures as array (should remain array)
- [ ] Verify data persists in database
- [ ] Check GET API returns otherInformation
- [ ] Test with form-data (Postman)
- [ ] Test with JSON payload

---

**Both `createItem` and `createPremiumItem` APIs now fully support otherInformation!** 🎉
