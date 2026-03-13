import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role:     { type: String, enum: ['admin', 'user'], default: 'user' },
    isActive: { type: Boolean, default: true },
    requirePasswordChange: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.pre('save', function () {
    if (!this.isModified('password')) return;
    this.password = bcrypt.hashSync(this.password, 12);
});

userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compareSync(plain, this.password);
};

export default mongoose.model('User', userSchema);