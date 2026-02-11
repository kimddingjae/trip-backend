

export default async function handler(req, res) {
  // 1. CORS 설정: 내 깃허브 페이지 주소만 허용 (보안 강화)
  // '*' 대신 실제 본인의 깃허브 주소를 적으세요. 예: https://your-id.github.io
  const allowedOrigin = "https://kimddingjae.github.io"; 
  
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
    // 4. Gemini API 호출
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await response.json();
    
    // 5. 결과 반환
    res.status(200).json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Gemini 호출 중 오류가 발생했습니다.' });
  }
}
