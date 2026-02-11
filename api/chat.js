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
    // 💡 해결 핵심: 가장 표준적인 v1beta 엔드포인트와 'gemini-1.5-flash' 명칭을 사용합니다.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await response.json();

    // 구글 API에서 에러 응답이 온 경우 처리 (404 Not Found 등)
    if (data.error) {
      console.error("Gemini API Error:", data.error.message);
      return res.status(200).json({ reply: `AI 서비스 오류: ${data.error.message}. 모델 설정을 확인해주세요.` });
    }

    // 정상적인 답변 추출
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "답변을 생성할 수 없습니다.";
    res.status(200).json({ reply: aiResponse });

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ reply: "서버 연결 오류가 발생했습니다." });
  }
}
