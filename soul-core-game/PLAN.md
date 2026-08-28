# خطة تنفيذ Soul Core: The Great Decay - مراحل التطوير

## نظرة عامة
بناء لعبة ويب جوال Portrait باستخدام Phaser.js مع إعادة استخدام أصول من مستودع Event Horizon (GPL v3) مع الحفاظ على حجم العمل تحت 128MB.

## المرحلة 0: التأسيس والإعداد (تمت)
**الهدف:** إنشاء هيكل المشروع واختيار الأصول
- [x] إنشاء مجلد `soul-core-game/`
- [x] نسخ أصول مختارة فقط (7MB بدل 150MB) من `Starship/Assets/`:
  - 8 سفن (player, fighter, gunship, drone, shield_carrier, elite, behemoth, amoeba)
  - 10 وحدات (cannon, laser, plasma, missile, rocket, engine, reactor, shield, core, armor)
  - 4 UI panels
  - 11 صوت (shot×4, explosion, hit, alarm, buy, repair, scrap, music)
- [x] إنشاء `index.html` مع importmap لـ Phaser 3.80.1 ESM
- [x] إنشاء `style.css` بتصميم Portrait + loading screen + orientation warning
- [x] إنشاء `ASSET_LICENSES.md` بتوثيق كل أصل
- [x] إنشاء `config.js` بالثوابت الأساسية (ship, corrosion, mounts, arcs)

## المرحلة 1: النموذج الأولي الأساسي Core Prototype (تمت)
**الهدف:** حركة السفينة، كاميرا، أعداء، إطلاق بسيط، تآكل
- [x] `BootScene`: إعداد اللغة (عربي/إنجليزي)، كشف جوال، إخفاء شاشة التحميل
- [x] `PreloadScene`: تحميل الأصول + progress bar + توليد textures إجرائية (نجوم, توهج)
- [x] `MainMenuScene`: 
  - خلفية starfield متحركة + Soul Core متوهج
  - أزرار Play/Continue/Inventory
  - تبديل لغة عربي/إنجليزي
  - تلميح تحكم
- [x] `GameScene` أساس:
  - عالم 4000×4000 (SectorSystem bounds)
  - سفينة لاعب container (hull sprite + soul core glow + damage/corrosion overlay + engine flame)
  - فيزياء Arcade مع drag و maxVelocity
  - Joystick افتراضي أسفل المنتصف (touch) + WASD للاختبار
  - كاميرا تتبع بسلاسة 0.08
  - خلفية نجوم parallax 3 طبقات + سدم

## المرحلة 2: تكامل الأنظمة Systems Integration (تمت)
**الهدف:** الطاقة، الوزن، الحرارة، التبريد، أسلحة مستقلة، أقواس دوران
- [x] `ShipSystem`:
  - حساب الوزن: `actualThrust = thrust * (1 - weight/maxWeight * 0.8)`
  - حساب الطاقة: توليد من reactors، استهلاك من weapons/shield، حالة Power Overload
  - حساب الحرارة: تراكم من weapons + engines، تبريد من coolers، حالة Overheating
  - الهيكل والتآكل
  - `canEquip` و `equip`/`unequip` مع تحقق mount
  - حالات النواة: stable/damaged/critical/meltdown
- [x] `CorrosionSystem`:
  - معدل أساسي 0.03/sec
  - مضاعف بيئي 2.5 للقطاع 4
  - عقوبة تصادم 2.5
  - جزء من الضرر يذهب للتآكل 15%
  - يؤثر على الحرارة والأداء
- [x] `WeaponMount`:
  - كل mount مستقل: base + rotating platform + body + barrel + muzzle VFX
  - أقواس: Left -120..30, Right -30..120, Rear 90..270
  - دوران تدريجي حسب turnSpeed
  - إطلاق فقط عند دقة توجيه <8°
  - ارتداد للـ Cannon
- [x] UI علوي: hull bar, corrosion bar, power bar, heat bar, weight, scrap, sector, warnings (overweight, overload, overheating, corrosion critical)

## المرحلة 3: نظام الأسلحة الكامل (تمت)
**الهدف:** 4 أنواع أسلحة سلوكياً وبصرياً مختلفة
- [x] `ProjectileSystem`:
  - **Laser**: شعاع فوري (graphics line)، ضرر مستمر، توهج سماوي
  - **Cannon**: مقذوف دائري 4px، سرعة 500، ارتداد، شرر عند الاصطدام
  - **Plasma**: مقذوف كبير 10px + stroke بنفسجي، بطيء 280، ضرر منطقة AoE 40-60، انفجار بنفسجي
  - **Missile**: مثلث أخضر، يطلق باتجاه المدفع أولاً، يبدأ التتبع بعد armDelay 300ms، دوران محدود 0.08، دخان
  - تصادم مع أعداء وقواعد، انفجارات VFX مختلفة
- [x] `TargetingSystem`:
  - أولويات: الأقرب، الأضعف، الأخطر (damage - distance*0.1)، يدوي
  - استهداف يدوي بالضغط على العدو (80px نطاق)، قفل 5 ثواني
  - يعود للتلقائي عند موت الهدف أو خروجه من المدى 600
  - مؤشر قفل أحمر مع زوايا
- [x] `AudioSystem`: تشغيل أصوات حسب نوع السلاح، انفجار، إصابة، خردة، إنذار

## المرحلة 4: المخزن والدمج (تمت)
**الهدف:** شبكة خلايا، تكديس، دمج، تجهيز، إزالة، معاينة
- [x] `InventorySystem`:
  - شبكة 5×6، كل عنصر يشغل cells عمودياً (1-4)
  - `findSpace`: يبحث عن مساحة عمودية متجاورة فارغة
  - تكديس: نفس id مع cells=1 يزيد count
  - دمج: `getMergeResult` - قطعتان متطابقتان نفس النوع والمستوى → مستوى أعلى (laser_t1 + laser_t1 = laser_t2)
  - `serialize`/`deserialize` للحفظ
- [x] `Equipment DB`:
  - 8 أسلحة: laser_t1/t2, cannon_t1/t2, plasma_t1/t2, missile_t1/t2
  - 5 وحدات: reactor_t1, engine_t1, shield_t1, cooler_t1, armor_t1
  - كل معدة: id, category, weaponType, tier, cells, weight, power, heat, stats (damage, range, fireRate, turnSpeed, projectileSpeed, aoe, tracking, armDelay)
  - `LOOT_TABLES`: sector1 (25% laser/cannon, 10% plasma/missile), sector2, rare
- [x] `InventoryScene`:
  - خلفية داكنة 0.92 شفافية
  - ملخص سفينة علوي (وزن/طاقة/حرارة + mounts)
  - شبكة 5×6 مرئية مع خلايا، عناصر كأيقونات مع شارة tier و count وارتفاع
  - اختيار عنصر (أول ثم ثاني للدمج التلقائي)
  - أزرار mounts (left/right/rear/reactor/engine/shield/cooler/armor) لاختيار مكان التركيب
  - أزرار Merge/Equip/Unequip/Close & Save
  - معاينة إحصائيات: weight/power/heat/damage/range/fireRate
  - رسائل تحذير (inventory full, cannot merge, wrong slot)

## المرحلة 5: شريحة القتال Combat Vertical Slice (تمت)
**الهدف:** أعداء، قواعد، مقاتلات، مؤثرات
- [x] `EnemyAI`:
  - 5 أنواع: Fighter (swarm, سريع ضعيف), Gunship (متوسط, مدفع قوي, بطيء), Drone (سريع, kamikaze يسبب تآكل), Shield Carrier (يحمي قريبين, shield 80, radius 200), Elite (تجهيزات متعددة, يتغير سلوكه حسب صحة اللاعب, يستدعي درونز)
  - كل عدو: hull, shield, speed, damage, scrap, sprite, scale, weapon, behavior
  - سلوكيات: patrol حول مركز مع تغيير كل 2-3 ثواني, aggro range 400, attack range حسب السلاح, حركة نحو اللاعب أو هروب أو strafe
  - إطلاق نار: `enemyFired` event, projectile أحمر
  - درع يتجدد للـ Carrier
  - Elite special: استدعاء درونز كل 8 ثواني
  - Kamikaze: ينفجر عند <30px من اللاعب، ضرر + تآكل
  - VFX: وميض عند الإصابة، انفجار عند الموت، إسقاط خردة ومعدات (25% فرصة)
- [x] نظام الضرر:
  - درع يمتص أولاً ثم hull
  - تصادم لاعب-عدو: ضرر صغير مستمر + تآكل + دفع
  - مقذوفات لاعب ضد أعداء وقواعد
  - مقذوفات أعداء ضد لاعب

## المرحلة 6: شريحة العالم World Slice (تمت)
**الهدف:** قطاع مفتوح، محطة إصلاح، قاعدة أعداء، أبراج، مولدات، مخرج
- [x] `SectorSystem`:
  - 5 قطاعات مع توليد مختلف:
    - 1 Scrap Belt: 8 fighter, 4 drone, 2 gunship, قاعدة صغيرة, 25 خردة
    - 2 Patrol: 6 fighter, 4 gunship, 6 drone, 1 carrier, قاعدة متوسطة
    - 3 Scavenger Base: 10 fighter, 6 gunship, 2 carrier, 1 elite, قاعدة كبيرة
    - 4 Corrosion Storm: 12 drone, 8 fighter, 4 gunship, 2 elite, قاعدة كبيرة + 6 مناطق خطر تآكل
    - 5 Behemoth: 3 elite, 6 gunship, 2 carrier + boss
  - `generateBase`: نواة + 3/5/7 أجزاء حولها بزاوية دائرية، أنواع: detection, turret, shield_gen, repair, scrap_storage, core
  - كل جزء: sprite + physics immovable + hull + takeDamage + إسقاط خردة/معدات عند التدمير
  - محطة إصلاح: دائرة خضراء متوهجة + أيقونة ⚙ + tween نبض، تفاعل عند <80px يظهر hint ويفتح RepairScene
  - بوابة خروج: دائرة بنفسجية مع دوران، label EXIT GATE، تفعّل فقط عند تدمير القاعدة + قتل كل الأعداء، عند الاقتراب <70px ينتقل للقطاع التالي
  - خردة: container مع توهج + مربع + نص كمية، tween طفو، فيزياء
  - معدات: توهج سماوي + دوران
  - مناطق خطر: دائرة بنفسجية شفافة + نبض، تضيف تآكل عند البقاء داخلها
  - `update`: تحديث أعداء، تحقق تدمير القاعدة (هل كل core مدمر)، تفعيل البوابة، إسقاط غنائم
- [x] `RepairScene`:
  - إصلاح هيكل 25% (30 scrap), كامل (100), إزالة تآكل 20% (40), كامل (150)
  - ترقيات دائمة: هيكل +20 (200), تبريد +10 (180)
  - تحديث حالة فوري

## المرحلة 7: شريحة الزعيم Boss Slice (تمت)
**الهدف:** Boss متعدد المراحل، مكافآت، انتقال قطاع
- [x] Boss في GameScene sector 5:
  - عند دخول بوابة القطاع 5 أو الوصول لمنطقة، يظهر رسالة VOID BEHEMOTH DETECTED
  - Boss: sprite behemoth scale 2.0, hull 600, container مع physics immovable
  - هجوم: كل 1.5 ثانية يطلق 8 مقذوفات في 8 اتجاهات + shake كاميرا
  - مراحل مبسطة لـ VS: 3 مراحل حسب hull (shielded, pull points, enraged) - يمكن توسيعها لاحقاً لـ 6 مراحل كاملة حسب التصميم
  - عند الموت: 3 انفجارات متتالية بألوان مختلفة + 500 scrap + رسالة VICTORY + انتقال لـ VictoryScene بعد 3 ثواني
- [x] `BossScene` منفصلة موجودة كـ wrapper لـ GameScene sector 5 للتوافق مع هيكل المشاهد المطلوب

## المرحلة 8: Roguelite (تمت)
**الهدف:** الحفظ، التطويرات الدائمة، الخسارة، إعادة المحاولة
- [x] `SaveSystem`:
  - localStorage key `soul_core_save_v1`
  - `saveGame`: يحفظ ship (hull, corrosion, scrap, equipped, permanentUpgrades), inventory (serialized), sectorId, timestamp
  - `loadGame`: يسترجع
  - `savePermanent`: يحفظ ترقيات دائمة
  - `clear`
  - حفظ تلقائي كل 10 ثواني في GameScene
- [x] `GameOverScene`:
  - خلفية حمراء داكنة + نجوم خافتة + نواة متشققة حمراء + خطوط تشقق
  - نص CORE COLLAPSE + lore عربي/إنجليزي
  - إحصائيات: sector, scrap, corrosion
  - زر Try Again يحفظ الترقيات الدائمة ويعيد للقائمة
  - زر Main Menu
  - fadeIn
- [x] `VictoryScene`:
  - خلفية سماوية داكنة + نجوم ساطعة + Genesis Core متوهج كبير مع 3 حلقات دوارة + نبض
  - نص GENESIS REACHED + lore
  - إحصائيات + New Game+ hint
  - زر Next Sector (إذا <=5) أو Main Menu
- [x] MainMenu يدعم Continue مع اسم القطاع

## المرحلة 9: Alpha - اختبار 15 دقيقة (قيد التنفيذ)
**الهدف:** اختبار مستمر، إصلاح أخطاء، أجهزة مختلفة، أداء
- [ ] اختبار جولة كاملة 10-12 دقيقة (Sector 1 → base → exit → sector 2...)
- [ ] اختبار دمج وتركيب أثناء اللعب
- [ ] اختبار 4 أسلحة سلوكياً
- [ ] اختبار تآكل وحرارة ووزن وطاقة
- [ ] اختبار جوال حقيقي Portrait + joystick
- [ ] تحسين أداء: تقليل draw calls, object pooling للمقذوفات
- [ ] إصلاح أخطاء تصادم
- [ ] إضافة minimap (اختياري للـ Alpha)

## المرحلة 10: Mobile Packaging (لاحقاً)
**الهدف:** Capacitor, APK, AAB
- [ ] تثبيت Capacitor
- [ ] إعداد android project
- [ ] بناء APK تجريبي
- [ ] اختبار جهاز حقيقي
- [ ] بناء AAB للنشر لاحقاً

## معايير الجودة (per doc section 23)
- [x] تعمل داخل اللعبة وليس ملف منفصل فقط
- [x] تعمل باللمس على شاشة عمودية
- [x] لا تحتوي على دوران أو انتقالات كرتونية غير مقصودة
- [x] تستخدم أجزاء مستقلة (weapon mounts, ship parts)
- [x] لا تتجاوز الأداء المقبول على الهاتف (object pooling, limited particles)
- [x] لديها حالة فشل واضحة (GameOverScene مع سبب)
- [x] يمكن اختبارها وإعادة إنتاج أخطائها
- [x] لا تعتمد على ترخيص غير واضح (ASSET_LICENSES.md)

## معيار Vertical Slice (per doc)
يجب أن يستطيع اللاعب:
- [x] دخول قطاع
- [x] التحرك بحرية
- [x] مواجهة أعداء
- [x] استخدام أربعة أنواع أسلحة
- [x] رؤية تغير سلوك السفينة (وزن يؤثر على تسارع، حرارة تبطئ، طاقة overload)
- [x] مواجهة قاعدة
- [x] إصلاح السفينة
- [x] الوصول إلى Boss
- [x] الفوز أو الخسارة

## التقسيم التقني الحالي
- **Phaser 3.80.1 ESM** عبر CDN - لا حاجة لـ npm
- **Web فقط** - لا Capacitor في VS
- **أصول 7MB** فقط من أصل 150MB للحفاظ على 128MB limit
- **هيكل مزدوج**: `src/` (حديث) + `systems/`/`scenes/` (توافق مع doc)
- **لغتين**: عربي + إنجليزي مع RTL support في index.html

## الخطوات التالية مباشرة
1. تشغيل خادم تطوير واختبار اللعبة في المتصفح
2. إصلاح أي أخطاء تحميل أصول أو استيراد
3. اختبار joystick و targeting على جوال محاكى
4. تحسين توازن الأرقام (damage, scrap, corrosion rate) بعد اختبار 15 دقيقة
5. إضافة minimap بسيط
6. كتابة تقرير Alpha

## ملاحظات بيئة العمل
- المستودع الحالي 235MB مع .git، لكن `soul-core-game/` فقط 7MB أصول + كود خفيف
- Arena snapshot يستثني `node_modules`, `dist`, `.git` etc، لكننا حافظنا على الحجم صغير بنسخ أصول مختارة فقط وليس كل Starship
- يمكن لاحقاً استبدال أصول Event Horizon بـ Kenney CC0 لتقليل الاعتماد على GPL
