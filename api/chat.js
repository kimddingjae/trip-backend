export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { message } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  try {
    // 💡 해결 핵심: 리스트에 확인된 'gemini-flash-latest' 모델명을 사용합니다.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(200).json({ reply: `AI 에러: ${data.error.message}` });
    }

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "답변을 생성할 수 없습니다.";
    res.status(200).json({ reply: aiResponse });

  } catch (error) {
    res.status(500).json({ reply: "서버 연결 오류가 발생했습니다." });
  }
}
