import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GameProvider } from './lib/game';
import Index from './routes/index';
import Market from './routes/market';
import Refer from './routes/refer';
import Withdraw from './routes/withdraw';

function App() {
  return (
    <GameProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/market" element={<Market />} />
          <Route path="/refer" element={<Refer />} />
          <Route path="/withdraw" element={<Withdraw />} />
        </Routes>
      </BrowserRouter>
    </GameProvider>
  );
}

export default App;
