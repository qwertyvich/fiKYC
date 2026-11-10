# Спецификации аватарок

Режим: встроенный image_gen, четыре отдельных изображения. Проектные копии оригиналов — `public/branding/telegram/{general,claude}-{bot,operator}.png`. Изображения не заменяют логотипы приложения. Анимация и типографика баннеров собраны кодом из слоёв; оригинальные PNG сохранены.

## General bot

Square Telegram bot avatar, reference: existing ficus-mascot.png. Preserve the recognizable friendly five-leaf ficus mascot in a pot with its face. Muted lime, dark green outlines, warm cream #F4F2EA background. Minimal flat vector-like illustration, confident clean silhouette, generous circular-crop safe margins. Small green shield with checkmark communicates a KYC service, not a verified social account badge. Only short bold text KYC. No extra logos, no 3D, neon glow, grain or visual clutter.

## Claude bot

Square Telegram bot avatar, reference: existing clawd/hello.png. Terracotta pixel Clawd character centered on warm cream #F4F2EA. Palette #D58258 / #24252A, minimal flat graphic with crisp outline and generous circular-crop safe margins. Small green check shield and the short bold text KYC. No OpenAI knot, Telegram logo or suggestion of official affiliation. No 3D, glow or decorative clutter.

## Operators — one call per theme

Create ONE square Telegram support operator avatar matching this [general / claude] reference exactly in character and palette. Keep cream background and this recognizable mascot. Replace the KYC shield and all KYC text with a simple professional headset and tiny speech bubble to communicate a human support operator. At the bottom use the single Russian word «ПОМОЩЬ» in bold clean dark sans serif, absolutely no other text. For green theme use the ficus character; for Claude use the terracotta pixel character. Minimal flat graphic, crisp strong dark outline, restrained color, no grain, no 3D, no gradients, no extra logos. Fit mascot, headset and bottom lettering inside a central safe circle with generous 14 percent margin so Telegram circular crop never clips important elements. Warm, confident, coherent with reference.

## Motion

Avatar exports inset the unchanged artwork into the square to protect Telegram's circular crop; a restrained six-second breathing loop preserves legibility. Banner: warm cream panel, green ficus wordmark, exact Russian headline «Верификация на ваш аккаунт», character connecting to a computer, moving connection dot and gentle checkmark pulse. The menu version adds a moving downward arrow and «Выберите раздел кнопкой ниже». Claude uses terracotta Clawd; general uses the existing ficus mascot. All text is set deterministically with the project's Geologica font.
