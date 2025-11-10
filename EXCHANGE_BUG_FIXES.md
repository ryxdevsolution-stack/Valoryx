# Exchange Feature - Bug Fixes

## Issues Fixed

### 1. Missing `amount_received` Field
**Problem**: Backend expected `amount_received` but frontend wasn't sending it
**Fix**: Added calculation for `amount_received` based on payment difference
```typescript
const difference = getDifference()
const amountReceived = difference > 0 ? getTotalPaymentSplits() : 0
```

### 2. Data Type Issues
**Problem**: Some numeric values might have been sent as strings
**Fix**: Ensured all numeric fields are properly converted to numbers with 2 decimal precision

**Returned Items**:
```typescript
const returnedItems = selectedItems.map(item => {
  const perUnitGst = item.gst_amount / item.quantity
  const perUnitAmount = item.amount / item.quantity

  return {
    quantity: item.return_quantity,
    rate: Number(item.rate),
    gst_percentage: Number(item.gst_percentage),
    gst_amount: Number((perUnitGst * item.return_quantity).toFixed(2)),
    amount: Number((perUnitAmount * item.return_quantity).toFixed(2)),
    cost_price: item.cost_price ? Number(item.cost_price) : 0,
    mrp: item.mrp ? Number(item.mrp) : 0
  }
})
```

**New Items**:
```typescript
const formattedNewItems = newItems.map(item => ({
  quantity: Number(item.quantity),
  rate: Number(item.rate),
  gst_percentage: Number(item.gst_percentage),
  gst_amount: Number(item.gst_amount.toFixed(2)),
  amount: Number(item.amount.toFixed(2)),
  cost_price: item.cost_price ? Number(item.cost_price) : 0,
  mrp: item.mrp ? Number(item.mrp) : 0
}))
```

### 3. Enhanced Error Logging
**Problem**: Hard to debug API failures
**Fix**: Added comprehensive console logging

```typescript
console.log('Sending exchange request:', requestBody)
console.log('Returned items:', returnedItems)
console.log('New items:', newItems)
console.log('Payment data:', paymentData)

// In catch block
console.error('Failed to process exchange:', error)
console.error('Error response:', error.response?.data)
console.error('Error status:', error.response?.status)
console.error('Full error:', error)
```

### 4. Better Error Messages
**Problem**: Generic error messages didn't help identify issues
**Fix**: Show specific error from backend or detailed fallback

```typescript
const errorMessage = error.response?.data?.error ||
                    error.response?.data?.message ||
                    error.message ||
                    'Failed to process exchange. Please check the console for details.'
```

## Testing Steps

1. **Test Exchange Flow**:
   - Navigate to billing page
   - Click "Exchange" button on any bill
   - Select items to return
   - Add new items
   - Add payment if balance is due
   - Click "Process Exchange"
   - Check browser console for logs
   - Verify success message or see detailed error

2. **Check Console Logs**:
   - Open browser DevTools (F12)
   - Go to Console tab
   - Process an exchange
   - Look for:
     - "Sending exchange request:" log
     - "Returned items:" log
     - "New items:" log
     - "Payment data:" log
     - Any error messages with details

3. **Verify Data**:
   - All amounts should be numbers with 2 decimals
   - `amount_received` should match payment total when customer owes money
   - `amount_received` should be 0 when refund is due

## Expected Request Format

```json
{
  "returned_items": [
    {
      "product_id": "uuid",
      "product_name": "Product A",
      "item_code": "PROD-001",
      "hsn_code": "1234",
      "unit": "PCS",
      "quantity": 2,
      "rate": 100.00,
      "gst_percentage": 18.00,
      "gst_amount": 36.00,
      "amount": 236.00,
      "cost_price": 80.00,
      "mrp": 120.00
    }
  ],
  "new_items": [
    {
      "product_id": "uuid",
      "product_name": "Product B",
      "item_code": "PROD-002",
      "hsn_code": "5678",
      "unit": "PCS",
      "quantity": 3,
      "rate": 150.00,
      "gst_percentage": 18.00,
      "gst_amount": 81.00,
      "amount": 531.00,
      "cost_price": 120.00,
      "mrp": 180.00
    }
  ],
  "payment_type": "[{\"PAYMENT_TYPE\":\"CASH\",\"AMOUNT\":295}]",
  "amount_received": 295.00,
  "customer_name": "Customer Name",
  "customer_phone": "9876543210",
  "customer_gstin": "27XXXXX1234X1X1"
}
```

## Common Errors and Solutions

### Error: "Original bill not found"
- Verify the bill ID is correct
- Check if user has access to this bill

### Error: "No items selected for return"
- Ensure at least one item is selected for return
- Check that `returned_items` array is not empty

### Error: "Cannot return more than purchased"
- Verify return quantity doesn't exceed original quantity
- Check quantity calculations

### Error: "Insufficient stock for..."
- Check stock availability for new items
- Verify stock quantities in database

### Error: "Payment amount must equal balance due"
- Ensure payment splits total matches difference when customer owes money
- Verify payment calculations

---

**All exchange bugs have been fixed! The exchange feature should now work properly.** 🔄✅
