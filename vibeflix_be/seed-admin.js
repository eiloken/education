// seed-admin.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const username = 'quanganh98';          // ← change if you want
const email    = 'levietquanganh98@gmail.com';  // ← your email
const password = '@QuangAnh98';      // ← change immediately after first login

await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/vibeflix');

const existing = await User.findOne({ $or: [{ username }, { email }] });
if (existing) {
    console.log('⚠️  User already exists:', existing.username);
    process.exit(0);
}

await new User({ username, email, password, role: 'admin' }).save();
console.log(`✅ Admin created — username: "${username}", password: "${password}"`);
process.exit(0);