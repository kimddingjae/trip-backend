export default async function handler(req, res) {
  // 1. 보안 및 CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { message } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  try {
    // 💡 핵심 수정: 모델 경로와 호출 방식을 Google 표준 v1beta로 고정합니다.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await response.json();

    // 2. 구글 API 자체 에러 처리 (로그에 찍혔던 404 등 예방)
    if (data.error) {
      console.error("Google API Error:", data.error.message);
      return res.status(200).json({ reply: `AI 서비스 오류: ${data.error.message}` });
    }

    // 3. 정상 답변 추출
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "답변을 생성할 수 없습니다.";
    res.status(200).json({ reply: aiResponse });

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ reply: "서버 내부 오류가 발생했습니다." });
  }
}
