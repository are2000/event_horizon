export const L10N = {
    en: {
        play: 'PLAY',
        continue: 'CONTINUE',
        inventory: 'INVENTORY',
        repair: 'REPAIR STATION',
        settings: 'SETTINGS',
        language: 'LANGUAGE',
        hull: 'HULL',
        corrosion: 'CORROSION',
        power: 'POWER',
        heat: 'HEAT',
        weight: 'WEIGHT',
        scrap: 'SCRAP',
        targeting: 'TARGET',
        closest: 'CLOSEST',
        weakest: 'WEAKEST',
        dangerous: 'DANGER',
        manual: 'MANUAL',
        merge: 'MERGE',
        equip: 'EQUIP',
        unequip: 'UNEQUIP',
        scrap_collected: 'Scrap Collected',
        sector: 'SECTOR',
        sector_names: {
            1: 'Scrap Belt',
            2: 'Patrol Zone',
            3: 'Scavenger Base',
            4: 'Corrosion Storm',
            5: 'Behemoth Zone'
        },
        warnings: {
            overweight: 'OVERWEIGHT!',
            power_overload: 'POWER OVERLOAD!',
            overheating: 'OVERHEATING!',
            corrosion_critical: 'CORROSION CRITICAL!'
        },
        game_over: 'CORE COLLAPSE',
        victory: 'GENESIS REACHED',
        try_again: 'TRY AGAIN',
        soul_core_state: {
            stable: 'STABLE',
            damaged: 'DAMAGED',
            critical: 'CRITICAL',
            meltdown: 'MELTDOWN'
        },
        joystick_hint: 'DRAG TO MOVE',
        tap_to_target: 'TAP ENEMY TO LOCK',
        base_destroyed: 'BASE DESTROYED',
        boss_approaching: 'VOID BEHEMOTH DETECTED'
    },
    ar: {
        play: 'ابدأ',
        continue: 'متابعة',
        inventory: 'المخزن',
        repair: 'محطة الإصلاح',
        settings: 'الإعدادات',
        language: 'اللغة',
        hull: 'الهيكل',
        corrosion: 'التآكل',
        power: 'الطاقة',
        heat: 'الحرارة',
        weight: 'الوزن',
        scrap: 'الخردة',
        targeting: 'الاستهداف',
        closest: 'الأقرب',
        weakest: 'الأضعف',
        dangerous: 'الأخطر',
        manual: 'يدوي',
        merge: 'دمج',
        equip: 'تركيب',
        unequip: 'إزالة',
        scrap_collected: 'تم جمع الخردة',
        sector: 'القطاع',
        sector_names: {
            1: 'حزام الخردة',
            2: 'منطقة الدوريات',
            3: 'قاعدة الزبالين',
            4: 'عاصفة التآكل',
            5: 'منطقة العملاق'
        },
        warnings: {
            overweight: 'وزن زائد!',
            power_overload: 'حمل طاقة زائد!',
            overheating: 'حرارة مرتفعة!',
            corrosion_critical: 'تآكل حرج!'
        },
        game_over: 'انهيار النواة',
        victory: 'تم الوصول للمنشأ',
        try_again: 'حاول مجدداً',
        soul_core_state: {
            stable: 'مستقر',
            damaged: 'متضرر',
            critical: 'حرج',
            meltdown: 'انهيار'
        },
        joystick_hint: 'اسحب للتحرك',
        tap_to_target: 'اضغط على العدو للاستهداف',
        base_destroyed: 'تم تدمير القاعدة',
        boss_approaching: 'تم رصد العملاق الفراغي'
    }
};

export let currentLang = 'ar';

export function setLanguage(lang) {
    if (L10N[lang]) currentLang = lang;
}

export function t(key) {
    const keys = key.split('.');
    let val = L10N[currentLang];
    for (const k of keys) {
        if (val && typeof val === 'object' && k in val) {
            val = val[k];
        } else {
            // fallback to en
            let fallback = L10N.en;
            for (const kk of keys) {
                if (fallback && typeof fallback === 'object' && kk in fallback) {
                    fallback = fallback[kk];
                } else {
                    return key;
                }
            }
            return fallback;
        }
    }
    return typeof val === 'string' ? val : key;
}

export function getSectorName(sectorId) {
    const names = L10N[currentLang].sector_names;
    return names[sectorId] || `Sector ${sectorId}`;
}
