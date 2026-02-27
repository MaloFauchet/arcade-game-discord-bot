import mongoose from "mongoose";

const economySchema = new mongoose.Schema({
    userId: {type: String, required: true, unique: true},
    balance: {type: Number, default: 100}  // On donne 100 pièces de départ aux nouveaux joueurs
});

export default mongoose.model('Economy', economySchema);
