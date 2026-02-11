export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { message } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  try {
    // 💡 핵심 수정: 모델명을 가장 기본인 'gemini-pro'로 변경하여 호환성 문제를 해결합니다.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await response.json();

    // 구글 API 응답 에러 체크
    if (data.error) {
      console.error("API Error Detail:", data.error.message);
      return res.status(200).json({ reply: `AI 서비스 오류: ${data.error.message}` });
    }

    // 💡 답변 추출 경로 보강 (Candidates가 없는 경우 대비)
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "답변을 생성할 수 없습니다. 다시 시도해주세요.";
    res.status(200).json({ reply: aiResponse });

  } catch (error) {
    res.status(500).json({ reply: "서버 연결 오류가 발생했습니다." });
  }
}
