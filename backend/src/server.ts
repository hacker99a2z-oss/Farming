import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes
import playerRoutes from './routes/player.js';
app.use('/api/player', playerRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
