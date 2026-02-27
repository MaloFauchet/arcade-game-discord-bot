import mongoose from "mongoose";

const userStatSchema = new mongoose.Schema({
    userId: {type: String, required: true},
    gameName: {type: String, required: true},
    wins: {type: Number, default: 0},
    losses: {type: Number, default: 0}
});

userStatSchema.index({userId: 1, gameName: 1}, {unique: true});

export default mongoose.model('UserStat', userStatSchema);
