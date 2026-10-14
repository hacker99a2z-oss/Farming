import { Router } from 'express';
import {
  loadPlayer,
  tapField,
  claimFieldAd,
  claimDaily,
  sellCrops,
  withdraw,
  getGramQuote,
  createSeedOrder,
  confirmSeedOrder,
} from '../controllers/player';

const router = Router();

router.post('/load', loadPlayer);
router.post('/tap', tapField);
router.post('/claim-ad', claimFieldAd);
router.post('/claim-daily', claimDaily);
router.post('/sell', sellCrops);
router.post('/withdraw', withdraw);
router.get('/quote', getGramQuote);
router.post('/create-order', createSeedOrder);
router.post('/confirm-order', confirmSeedOrder);

export default router;
