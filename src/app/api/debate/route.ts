import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { STRATEGISTS, STAGES } from '@/lib/gameData';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
    }

    const body = await req.json();
    const { diffMs, userExcuse, strategistId, stageId, userGear, playMode } = body;

    if (diffMs === undefined || userExcuse === undefined || !strategistId || !stageId) {
      return NextResponse.json({ error: '軍議に必要な情報が欠落しています。' }, { status: 400 });
    }
    
    // バリデーション（プロンプトインジェクション・文字数制限）
    if (userExcuse.length > 200 || (userGear && userGear.length > 200)) {
      return NextResponse.json({ error: '発言が長すぎます。簡潔に申告してください。' }, { status: 400 });
    }
    
    // チート対策
    if (diffMs < 0 || diffMs > 10000) {
      return NextResponse.json({ error: '不正な練兵記録が検出されました。' }, { status: 400 });
    }
    
    const strategist = STRATEGISTS.find(s => s.id === strategistId);
    const stage = STAGES.find(s => s.id === stageId);
    
    if (!strategist || !stage) {
      return NextResponse.json({ error: '指定された軍師または陣が存在しません。' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });

    // 1. 合否の事前計算
    const isPassed = diffMs <= strategist.toleranceMs;
    
    const modeContext = playMode === 'laidback'
      ? "ユーザーは、ジャズやR&B特有の心地よいタメ（+25msのビハインド・ザ・ビート）を『意図的』に狙うという高度な戦法（遅攻法）で出陣しました。単なる遅れとして非難するのではなく、その『タメの精度（シフトした目標からのズレ）』を評価基準として舌戦を展開してください。"
      : "ユーザーは完璧なジャストタイミング（誤差0ms）を狙って出陣しました。";

    // 2. プロンプトへの強制注入
    const systemPrompt = `【超重要：絶対遵守する人格設定（ペルソナ）】
${strategist.personaPrompt}

【基本情報】
あなたは ${strategist.name} です。
${strategist.systemPrompt}

【現在の戦況（絶対の事実）】
・ステージ: ${stage.title} (BPM: ${stage.bpm}, ターゲット: ${stage.targetBeat})
・ユーザーの機材: ${userGear || '申告なし'}
・戦法: ${modeContext}
・ユーザーのズレ（絶対値平均）: ${diffMs} ms
・全打点のズレ配列: ${JSON.stringify(body.trainingDiffs)}
  （※マイナスは目標より早い「走り/突っ込み」、プラスは目標より遅い「モタリ」を表します。これを詳細に分析してダメ出しや称賛の材料にしてください）
・合格ライン（許容誤差）: ${strategist.toleranceMs} ms 以下
・判定結果: ${isPassed ? '合格（ユーザーの勝利）' : '不合格（ユーザーの敗北）'}
あなたの性格パラメーターは【${strategist.personality}】です。

この合否判定という『絶対的な事実』を覆さない範囲で、ユーザーの言い訳（${userExcuse}）に対してあなたの性格に基づいたレスポンスを返してください。

必ず以下のJSONスキーマに従って出力してください。
{
  "tacticianMessage": "あなたのレスポンス（セリフ）",
  "diagnosedWarlord": "今回のプレイスタイルに最も近い三国志の武将名（例：曹操、張飛、周瑜など。あなた以外の武将でも可）",
  "sessionStats": {
    "leadership": 0〜100の数値（統率：打点の安定感、分散の少なさ）,
    "martial": 0〜100の数値（武力：ズレの少なさ、または前ノリの攻めの姿勢）,
    "intelligence": 0〜100の数値（知力：ミリ秒の精度と言い訳の論理性）,
    "charm": 0〜100の数値（魅力：遅攻法の巧みさや、言い訳のユーモア）
  }
}
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });
    
    const responseText = await result.response.text();
    const parsed = JSON.parse(responseText);
    
    return NextResponse.json({ ...parsed, isPassed });

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: '天候が悪化し、軍議が中断されました（Internal Server Error）' }, { status: 500 });
  }
}
