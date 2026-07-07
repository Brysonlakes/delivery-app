const crypto = require('crypto');

const paymentData = {
  merchant_id: '10050979',
  merchant_key: '4wukgyn1umzxz',
  return_url: 'http://localhost:4000/api/payfast/return?orderId=test123',
  cancel_url: 'http://localhost:4000/api/payfast/cancel?orderId=test123',
  notify_url: 'http://localhost:4000/api/payfast/notify',
  name_first: 'Test Customer',
  email_address: 'customer@test.com',
  m_payment_id: 'test123',
  amount: '9.99',
  item_name: 'Margherita',
};

const passphrase = '';

const sortedKeys = Object.keys(paymentData).sort();
const pfParamString = sortedKeys
  .map(key => `${key}=${encodeURIComponent(paymentData[key].toString().trim()).replace(/%20/g, '+')}`)
  .join('&');

const signatureString = pfParamString + '&passphrase=' + encodeURIComponent(passphrase).replace(/%20/g, '+');
console.log('Signature string:', signatureString);

const signature = crypto.createHash('md5').update(signatureString).digest('hex');
console.log('Generated signature:', signature);