# Спецификации аватарок

Режим: встроенный image_gen для исходных аватаров и правок. Актуальные проектные PNG — `public/branding/telegram/{general,claude}-{bot,operator}.png`. Изображения не заменяют логотипы приложения. Анимация и типографика баннеров собраны кодом из слоёв. Фикус-оператор обновлён без надписи, с четырьмя уголками рамки внутри области круглого аватара.

## General bot

Square Telegram bot avatar, reference: existing ficus-mascot.png. Preserve the recognizable friendly five-leaf ficus mascot in a pot with its face. Muted lime, dark green outlines, warm cream #F4F2EA background. Minimal flat vector-like illustration, confident clean silhouette, generous circular-crop safe margins. Small green shield with checkmark communicates a KYC service, not a verified social account badge. Only short bold text KYC. No extra logos, no 3D, neon glow, grain or visual clutter.

## Claude bot

Square Telegram bot avatar, reference: existing clawd/hello.png. Terracotta pixel Clawd character centered on warm cream #F4F2EA. Palette #D58258 / #24252A, minimal flat graphic with crisp outline and generous circular-crop safe margins. Small green check shield and the short bold text KYC. No OpenAI knot, Telegram logo or suggestion of official affiliation. No 3D, glow or decorative clutter.

## Operators — one call per theme

Create ONE square Telegram support operator avatar matching this [general / claude] reference exactly in character and palette. Keep cream background and this recognizable mascot. Replace the KYC shield and all KYC text with a simple professional headset and tiny speech bubble to communicate a human support operator. At the bottom use the single Russian word «ПОМОЩЬ» in bold clean dark sans serif, absolutely no other text. For green theme use the ficus character; for Claude use the terracotta pixel character. Minimal flat graphic, crisp strong dark outline, restrained color, no grain, no 3D, no gradients, no extra logos. Fit mascot, headset and bottom lettering inside a central safe circle with generous 14 percent margin so Telegram circular crop never clips important elements. Warm, confident, coherent with reference.

## General operator — frame edit

Use case: precise-object-edit / compositing.
Edit the ficus SUPPORT OPERATOR mascot image supplied here. It is the friendly five-leaf lime-green ficus in a pot, wearing a headset, with a little three-dot speech bubble, cream background, and the Russian word ПОМОЩЬ at the bottom.
The other supplied image, the pear inside green scan corners, is ONLY a framing reference. Do not include the pear or its black screenshot bars.
Remove the entire word ПОМОЩЬ and leave absolutely NO lettering, words, labels or watermark.
Place THIS SAME FICUS mascot in a frame made of FOUR SEPARATE thick lime-green rounded L-shaped corner brackets, exactly the kind of scan/viewfinder frame around the pear reference. These are four isolated 90-degree corners with smooth round bends and round stroke ends, NOT a complete rectangular border.
Preserve the ficus identity faithfully: five leaves, dark green outlines, pot body and face, headset with microphone, arms, feet and the small speech bubble. Do not redesign the character, facial expression or accessories. Resize and center the complete mascot to fit comfortably inside the corner brackets. All leaves and feet must be fully visible; brackets must not touch or overlap the character. Use balanced generous margins and a clean square composition suitable for an avatar.
Keep the original warm cream background and coherent green palette. Crisp polished flat illustration, minimal and friendly, no 3D, no extra decorations. Output one square image with no black bars.

## General operator — circular crop refinement

Edit this image into a TELEGRAM AVATAR THAT WILL BE CROPPED TO A CIRCLE.
Preserve the exact same friendly green five-leaf ficus support mascot, dark outline, face, headset, arms and feet, and small three-dot speech bubble. Keep the warm cream background and four separate rounded green scan-frame L-shaped corner brackets. No words, no lettering, no watermark.
The requested change is CIRCULAR CROP SAFETY: move all four corner brackets much closer to the center and scale the mascot down proportionally, so EVERY part of EVERY bracket is clearly visible inside an ordinary centered circular Telegram avatar crop. The present brackets are too close to the square corners and would be cut off.
Precise layout: square canvas. The complete outer bounding box of the four brackets should run only from about 20% to 80% of image width and 20% to 80% of image height. Keep the whole mascot comfortably inside this central frame, with its top leaf below the top brackets and feet above the bottom brackets. Leave broad clean cream margin outside the frame. Every colored pixel should fit within a centered circular safe area of diameter 86% of the square, so there is generous clearance from the actual circle edge. The brackets must still be bold and recognizable at a small 48-80px Telegram avatar size, with rounded L bends and rounded ends. Keep balanced spacing and no overlaps.
Do not draw a circular border or a circle preview: output a normal square image that is ready for Telegram to crop into a circle. Do not add extra objects or change the mascot design. Only adjust scale and placement to ensure the four corner brackets survive the circular crop.

## General operator — thumbnail legibility refinement

Refine ONLY the scale of this square Telegram avatar. Keep the exact same ficus mascot, headset, speech bubble, four green rounded corner brackets, colors and warm cream background. There is no text, and there must remain no text.
The current artwork is safely centered but a little too small in a Telegram chat-list avatar. Enlarge the ENTIRE existing composition (mascot plus all four brackets together as a single group) by approximately 20 percent about the center of the square. Do not change relative spacing, character design or bracket shape. Keep all four brackets fully inside a centered circular avatar crop, with some cream clearance: no colored part should be farther than 46 percent of canvas width from the image center.
Aim for the outer bracket bounds around 17-83 percent of the square dimensions, not near the square's actual corners. The entire mascot and every bracket must stay visible after the square is cropped into a circle. No visible circle outline, no extra decorations. Output the square avatar, not a mockup.

## Motion

Avatar exports inset the unchanged artwork into the square to protect Telegram's circular crop; a restrained six-second breathing loop preserves legibility. Description banner: warm cream panel, green ficus wordmark, exact Russian headline «Верифицированные аккаунты», character connecting to a computer, moving connection dot and gentle checkmark pulse. The menu version uses «Верификация на ваш аккаунт», adds a moving downward arrow and «Выберите раздел кнопкой ниже». Claude uses terracotta Clawd; general uses the existing ficus mascot. All text is set deterministically with the project's Geologica font.
