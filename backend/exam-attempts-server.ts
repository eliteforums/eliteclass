import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

app.get('/exam-attempts/:examId/violations', async (req, res) => {
  try {
    const { examId } = req.params;

    const { data, error } = await supabase.rpc('get_exam_attempt_violations', {
      p_exam_id: examId,
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data ?? []);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
});

const port = Number(process.env.PORT || 4003);
app.listen(port, () => console.log(`Exam attempts server listening on ${port}`));
