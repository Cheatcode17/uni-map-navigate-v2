import express from 'express';
import bodyParser from 'body-parser';
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(bodyParser.json());

app.post('/api/sendFeedback', async (req, res) => {
  const { feedback } = req.body;
  try {
    await resend.emails.send({
      from: 'Campus Map <no-reply@yourdomain.com>',
      to: 'michelakerele@gmail.com',
      subject: 'New Campus Map Feedback',
      html: `<p>${feedback}</p>`
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send email.' });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));