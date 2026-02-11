export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { message } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  try {
    // 💡 주소를 v1beta에서 v1으로, 모델명을 gemini-1.5-flash로 정확히 고정합니다.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await response.json();

    // 구글 에러 발생 시 처리
    if (data.error) {
      return res.status(200).json({ reply: `AI 서비스 오류: ${data.error.message}` });
    }

    // 데이터 추출
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "답변을 생성할 수 없습니다.";
    res.status(200).json({ reply: aiResponse });

  } catch (error) {
    res.status(500).json({ reply: "서버 연결에 실패했습니다." });
  }
}
