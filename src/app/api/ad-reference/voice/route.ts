import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { submitAdRefVoice, isValidVoice, cleanRefText, AD_REF_VOICES, AD_REF_TTS_MODEL, AD_REF_VOICE_COST } from '@/lib/ad-reference';
import { chargeAndSubmit, chargeErrorResponse } from '@/lib/marketing-studio/gen-task';

export const maxDuration = 60;

// elevenlabs v3 新配音(换声音+换台词):需登录 + 扣 AD_REF_VOICE_COST;提交/异步失败均退款,Atlas 报错透传。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = session.user.id;

  const body = await req.json().catch(() => ({}));
  const text = cleanRefText(body.text, '', 600);
  const voice = isValidVoice(body.voice) ? body.voice : AD_REF_VOICES[0].id;
  if (text.length < 4) return NextResponse.json({ error: 'text_required' }, { status: 400 });

  try {
    const submit = await chargeAndSubmit({
      uid,
      cost: AD_REF_VOICE_COST,
      ref: 'ad-reference:voice',
      templateId: 'adref:voice',
      model: AD_REF_TTS_MODEL,
      prompt: text,
      submit: () => submitAdRefVoice(text, voice),
    });
    return NextResponse.json({ id: submit.id, getUrl: submit.getUrl });
  } catch (e) {
    return chargeErrorResponse(e, 'ad-reference/voice');
  }
}

export const POST = withAtlas(__byokPOST);
