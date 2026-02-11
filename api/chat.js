export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { message } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  try {
    // 💡 모델 경로를 v1beta로 되돌리거나 최신 모델명(gemini-pro 등)으로 시도할 수 있습니다.
    // 여기서는 가장 안정적인 v1beta 엔드포인트의 gemini-1.5-flash-latest를 권장합니다.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await response.json();

    // API 에러 응답 처리
    if (data.error) {
      console.error("Gemini API Error Detail:", JSON.stringify(data.error));
      return res.status(200).json({ reply: `AI 에러: ${data.error.message}` });
    }

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "답변을 생성할 수 없습니다.";
    res.status(200).json({ reply: aiResponse });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: "서버 내부 오류 발생" });
  }
}
