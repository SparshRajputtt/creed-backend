const { postContact } = require('../controllers/contact');
const express = require('express');

const router = express.Router();

router.post('/', postContact);

module.exports = router;
