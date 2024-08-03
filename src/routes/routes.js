import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  res.send({ status: 200, message: "this is success" });
});

export default router;
