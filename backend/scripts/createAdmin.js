require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/db');
const User = require('../src/models/User');

const run = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('createAdmin script is for development only. Refusing to run in production.');
  }

  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }

  await connectDatabase();

  const email = ADMIN_EMAIL.trim().toLowerCase();

  let user = await User.findOne({ email });
  if (!user) {
    user = new User({ email });
  }

  user.name = ADMIN_NAME.trim();
  user.password = ADMIN_PASSWORD;
  user.role = 'admin';
  await user.save();

  console.log(`Admin user ready: ${user.name} (${user.email}) - role: ${user.role}`);
  console.log(`Admin ID: ${user._id}`);
};

run()
  .catch((error) => {
    console.error('Failed to create admin:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });