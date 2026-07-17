// 玩法卡片的预览视频(玩法 id → 同源 R2 媒体 url,可内联播放、不过期)。
// 由 multiref-demo/gen_examples.py 生成 → 转存到 R2 bucket marketing-studio-media(key: ex-<id>.mp4)。
export const EXAMPLE_VIDEOS: Record<string, string> = {
  ugc: '/api/marketing-studio/media/ex-ugc.mp4',
  'direct-to-camera': '/api/marketing-studio/media/ex-direct-to-camera.mp4',
  'selfie-testimonial': '/api/marketing-studio/media/ex-selfie-testimonial.mp4',
  'gadget-saved-me': '/api/marketing-studio/media/ex-gadget-saved-me.mp4',
  'secret-hack': '/api/marketing-studio/media/ex-secret-hack.mp4',
  review: '/api/marketing-studio/media/ex-review.mp4',
  unboxing: '/api/marketing-studio/media/ex-unboxing.mp4',
  'unboxing-asmr': '/api/marketing-studio/media/ex-unboxing-asmr.mp4',
  'try-on': '/api/marketing-studio/media/ex-try-on.mp4',
  'couple-sharing': '/api/marketing-studio/media/ex-couple-sharing.mp4',
  tvspot: '/api/marketing-studio/media/ex-tvspot.mp4',
  hypermotion: '/api/marketing-studio/media/ex-hypermotion.mp4',
  'giant-product': '/api/marketing-studio/media/ex-giant-product.mp4',
  'crush-test': '/api/marketing-studio/media/ex-crush-test.mp4',
  'camera-pov': '/api/marketing-studio/media/ex-camera-pov.mp4',
  'mess-to-fresh': '/api/marketing-studio/media/ex-mess-to-fresh.mp4',
};

// ── 一键复刻配方(对齐 Higgsfield:产品图 @product + 人物图 @avatar 双参考 + 一大段详细 prompt)──
// 出图:nano-banana/edit 用[人物图 + 产品图]双参考合成"该人物手持该产品 selfie"首帧(人脸/产品都像素级保留);
// 出视频:veo3.1-fast + 详细动作/长台词 → 对口型说话。已在 multiref-demo/repl_test2.py 实测跑通。
// image=产品图, avatar=人物图(UGC 口播类才有;无人玩法留空)。用户复刻后可各自替换成自己的产品图/出镜人。
export interface ExampleRecipe {
  productZh: string;
  productEn: string;
  image: string;        // 产品参考图
  avatar?: string;      // 人物参考图(仅 UGC 口播类)
  imgPrompt: string;    // nano-banana/edit 首帧 prompt
  vidPrompt: string;    // veo3.1-fast i2v prompt(详细场景+动作+台词)
}

const SELFIE = 'ENGLISH vertical 9:16 ultra-photorealistic UGC selfie photo, soft natural daylight, no filter, no text no watermark.';
const HERO = 'ENGLISH cinematic vertical 9:16 ultra-photorealistic photo, no text no watermark.';
const KEEP = 'the EXACT product shown in the provided product reference image — keep its shape, color, materials and proportions pixel-identical, do not redesign it';
const PERSON = 'Use the person shown in the provided portrait reference image — keep their exact face and identity.';
// 双图 selfie 首帧模板:人物(portrait ref)手持产品(product ref)
const selfieImg = (scene: string) => `${SELFIE} ${PERSON} They hold ${KEEP} in one hand. ${scene} Front-camera selfie, casual real unpolished framing, upper body, warm relaxed natural expression.`;
// 详细口播视频模板:selfie 拍摄 + 产品动作 + 台词
const talkVid = (person: string, scene: string, action: string, line: string) =>
  `A ${person} in ${scene} with soft natural daylight, recording a front-camera phone selfie — holding the phone in one hand and the product in the other, slight natural hand movement, casual real unpolished framing. Looks directly into the camera, relaxed and natural like talking to a friend. While speaking, ${action} Says warmly: "${line}" natural calm UGC voice, clear spoken English, natural lip sync.`;

export const EXAMPLE_RECIPES: Record<string, ExampleRecipe> = {
  ugc: {
    productZh: '薰衣草紫保温随行杯，磨砂质感、大容量，适合日常通勤随身带', productEn: 'A lavender insulated tumbler, matte finish, large capacity',
    image: '/api/marketing-studio/media/prod-ugc.jpg', avatar: '/api/marketing-studio/media/avatar-ugc.jpg',
    imgPrompt: selfieImg('Cozy modern apartment background.'),
    vidPrompt: talkVid('young female lifestyle influencer', 'a cozy modern apartment', 'she casually rotates the tumbler, shows the lid and takes a small sip.', "I use this tumbler every single day now. My drinks stay cold all day, it never leaks, and honestly I just take it everywhere."),
  },
  'direct-to-camera': {
    productZh: '黑色无线蓝牙耳机，配磁吸充电盒，降噪、音质好', productEn: 'Sleek black wireless earbuds with a magnetic charging case',
    image: '/api/marketing-studio/media/prod-direct-to-camera.jpg', avatar: '/api/marketing-studio/media/avatar-direct-to-camera.jpg',
    imgPrompt: selfieImg('Clean cozy home background.'),
    vidPrompt: talkVid('confident young man', 'a clean cozy room', 'he holds up the earbud case, flips it open and points at it.', "Okay I need to talk about these earbuds. The sound is unreal, they block out everything, and they last all day. Just get them."),
  },
  'selfie-testimonial': {
    productZh: '棕色玻璃瓶装护肤精华，主打提亮修护，两周见效', productEn: 'A brown glass bottle skincare serum, brightening and repairing',
    image: '/api/marketing-studio/media/prod-selfie-testimonial.jpg', avatar: '/api/marketing-studio/media/avatar-selfie-testimonial.jpg',
    imgPrompt: selfieImg('Soft-lit bathroom vanity background.'),
    vidPrompt: talkVid('fresh-faced young woman', 'a bright bathroom', 'she holds the serum bottle up near her cheek and gently taps it.', "I was honestly skeptical about this serum, but two weeks in? My skin looks brighter and so much smoother. I'm obsessed."),
  },
  'gadget-saved-me': {
    productZh: '手持无线小型吸尘器，轻便强吸力，桌面车内随手清洁', productEn: 'A compact handheld cordless vacuum',
    image: '/api/marketing-studio/media/prod-gadget-saved-me.jpg', avatar: '/api/marketing-studio/media/avatar-gadget-saved-me.jpg',
    imgPrompt: selfieImg('Modern kitchen background.'),
    vidPrompt: talkVid('friendly young man', 'a modern kitchen', 'he lifts the mini vacuum, points at it and mimes a quick clean.', "This little vacuum literally saved my mornings. It's tiny but so powerful — I use it on my desk, my car, everywhere."),
  },
  'secret-hack': {
    productZh: '可重复使用硅胶食物保鲜袋，密封防漏、可冷冻可加热', productEn: 'A reusable silicone food storage bag',
    image: '/api/marketing-studio/media/prod-secret-hack.jpg', avatar: '/api/marketing-studio/media/avatar-secret-hack.jpg',
    imgPrompt: selfieImg('Kitchen counter background, playful secretive vibe.'),
    vidPrompt: talkVid('playful young woman', 'a kitchen', 'she leans in holding the silicone bag, seals it and gives a knowing look.', "Nobody told me you could do this. These bags seal airtight, go straight in the freezer, and I've stopped buying plastic completely."),
  },
  review: {
    productZh: '不锈钢真空保温水杯，24 小时冷热、防漏防摔', productEn: 'A stainless steel vacuum water bottle',
    image: '/api/marketing-studio/media/prod-review.jpg', avatar: '/api/marketing-studio/media/avatar-review.jpg',
    imgPrompt: selfieImg('Neutral clean room background.'),
    vidPrompt: talkVid('poised woman', 'a clean neutral room', 'she turns the bottle in her hand to show it off and taps the lid.', "Let me show you why this bottle is different. It keeps drinks cold for twenty-four hours, it's totally leak-proof, and it survives every drop."),
  },
  unboxing: {
    productZh: '玻璃瓶装香水，高级礼盒包装，适合送礼', productEn: 'A glass bottle perfume in a premium gift box',
    image: '/api/marketing-studio/media/prod-unboxing.jpg', avatar: '/api/marketing-studio/media/avatar-unboxing.jpg',
    imgPrompt: selfieImg('Soft-lit tabletop with an opened gift box background.'),
    vidPrompt: talkVid('elegant young woman', 'a softly lit room', 'she lifts the perfume bottle from the box, turns it in the light admiringly.', "Wait, look how gorgeous this is. The bottle feels so premium, and the scent is absolutely stunning. This is the perfect gift."),
  },
  'try-on': {
    productZh: '白色运动鞋，轻量透气、百搭好穿', productEn: 'White sneakers, lightweight and versatile',
    image: '/api/marketing-studio/media/prod-try-on.jpg', avatar: '/api/marketing-studio/media/avatar-try-on.jpg',
    imgPrompt: selfieImg('Bright stylish room background, holding up the sneaker.'),
    vidPrompt: talkVid('fashionable young woman', 'a bright stylish room', 'she holds up the sneaker, turns it to show the design.', "Okay look at these sneakers. They're so lightweight, they go with everything, and they're actually comfortable from the very first wear."),
  },
  'crush-test': {
    productZh: '透明手机保护壳，军工级防摔、抗黄不变形', productEn: 'A clear protective phone case, military-grade drop protection',
    image: '/api/marketing-studio/media/prod-crush-test.jpg', avatar: '/api/marketing-studio/media/avatar-crush-test.jpg',
    imgPrompt: selfieImg('Plain modern room background, holding up the clear phone case.'),
    vidPrompt: talkVid('young man', 'a plain modern room', 'he bends and flexes the clear case hard with both hands to show it holds up.', "People keep asking if this case actually works. Watch — I bend it, I drop it, and it just will not break. Military-grade, no joke."),
  },
  'couple-sharing': {
    productZh: '分享装休闲零食，一袋两人吃，追剧居家必备', productEn: 'A shareable bag of snacks',
    image: '/api/marketing-studio/media/prod-couple-sharing.jpg',
    imgPrompt: `${SELFIE} A young couple sit close together on a cozy home sofa taking a selfie, both smiling, one of them holding ${KEEP}. Warm cozy living room, casual real framing, upper body.`,
    vidPrompt: 'A happy young couple on a cozy home sofa with warm light, taking a front-camera selfie together, sharing a bag of snacks, natural hand movement, casual real framing. One shows the snack bag to the other. One says: "Okay you have to try this." the other replies smiling: "Oh, that\'s so good." natural cozy UGC voice, clear spoken English, natural lip sync.',
  },
  'unboxing-asmr': {
    productZh: '新款智能手机，全面屏、贴膜开箱', productEn: 'A brand-new smartphone',
    image: '/api/marketing-studio/media/prod-unboxing-asmr.jpg',
    imgPrompt: `${SELFIE} Extreme close-up of hands slowly holding ${KEEP}, satisfying ASMR unboxing, soft light.`,
    vidPrompt: 'Extreme close-up of hands slowly turning and tapping the product with crisp satisfying ASMR sounds, minimal speech, soft light, immersive.',
  },
  tvspot: {
    productZh: '高端奢华手表，金属表带、精工质感', productEn: 'A luxury watch, metal band, premium craftsmanship',
    image: '/api/marketing-studio/media/prod-tvspot.jpg',
    imgPrompt: `${HERO} A cinematic hero product shot of ${KEEP} on a reflective black surface, dramatic rim light, premium commercial look, no people.`,
    vidPrompt: 'Cinematic slow push-in on the product as light sweeps across it, epic premium mood, a deep confident voiceover says: "Redefined." no on-screen people.',
  },
  hypermotion: {
    productZh: '气泡饮料罐，清爽果味、冰镇畅饮', productEn: 'A can of sparkling drink',
    image: '/api/marketing-studio/media/prod-hypermotion.jpg',
    imgPrompt: `${HERO} A high-energy product hero shot of ${KEEP} with dynamic water splashes frozen around it, vivid colors, no people.`,
    vidPrompt: 'The product spins as splashes of water burst around it in high energy, punchy upbeat rhythm, no dialogue.',
  },
  'giant-product': {
    productZh: '运动鞋，主打街头潮流、脚感科技', productEn: 'Sneakers with street-style design',
    image: '/api/marketing-studio/media/prod-giant-product.jpg',
    imgPrompt: `${HERO} A surreal shot of ${KEEP} as a giant object towering over a real city street with tiny people looking up, scroll-stopping scale.`,
    vidPrompt: 'The giant product looms over the city street, people look up in awe as the camera tilts up, cinematic, no dialogue.',
  },
  'camera-pov': {
    productZh: '咖啡保温随行杯，晨间提神、办公桌好伴侣', productEn: 'A coffee tumbler',
    image: '/api/marketing-studio/media/prod-camera-pov.jpg',
    imgPrompt: `${HERO} First-person POV of a hand reaching for ${KEEP} on a desk, immersive point of view, morning light.`,
    vidPrompt: 'POV: your hand reaches out and picks up the product, tilts it toward you, immersive first-person, subtle natural motion.',
  },
  'mess-to-fresh': {
    productZh: '桌面收纳整理盒，分格设计、告别杂乱', productEn: 'A desk organizer with compartments',
    image: '/api/marketing-studio/media/prod-mess-to-fresh.jpg',
    imgPrompt: `${HERO} A cluttered messy desk with a hand placing ${KEEP} on it.`,
    vidPrompt: 'A hand sets down the product and the messy desk transforms into a clean organized space in a satisfying transition, upbeat, no dialogue.',
  },
};
