

export default async function handler(req, res) {
  // 1. CORS 설정: 내 깃허브 페이지 주소만 허용 (보안 강화)
  // '*' 대신 실제 본인의 깃허브 주소를 적으세요. 예: https://your-id.github.io
  const allowedOrigin = "*"; 
  
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. 브라우저의 Preflight(사전 검사) 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. POST 요청이 아닌 경우 차단
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { message } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  try {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: message }] }]
    })
  });

  const data = await response.json();
  
  // 서버 로그에 구글로부터 받은 원본 데이터를 출력하여 확인합니다.
  console.log("Gemini Response:", JSON.stringify(data)); 

  const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "내용 없음";
  res.status(200).json({ reply: aiResponse });
} catch (error) {
  console.error("Server Error:", error);
  res.status(500).json({ error: error.message });
}
}
