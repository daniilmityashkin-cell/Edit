"""NOIR CAPTIONS — генератор стартового набора звуков (синтез, без чужих сэмплов и авторских прав).

    python sfx/generate_sfx.py            # перезаписывает папки sfx/<категория>/*.wav

Нужен numpy. Готовые .wav уже лежат в репозитории — запускать скрипт нужно только чтобы пересоздать их.
Это простые синтезированные звуки «для начала»; свои профессиональные паки кладите в папку:
  <проект>/sfx/<категория>/файл.wav      или      %APPDATA%\\NOIR Captions\\sfx\\<категория>\\файл.wav
Названия категорий: whoosh, pop, hit, click, rise, shimmer, morph, counter, blur_out, scale_down, glitch
Характер (яркие «воздушные» звуки, центр спектра 7–11 кГц) подобран по анализу демо-ролика с SFX-паком; сами звуки — собственный синтез.
(любые другие имена папок тоже работают).
"""
import glob
import os
import wave

import numpy as np

SR = 48000
OUT = os.path.dirname(os.path.abspath(__file__))
RNG = np.random.default_rng(20261029)


def tt(d):
    return np.arange(int(SR * d)) / SR


def noise(n):
    return RNG.standard_normal(n)


def lowpass(x, fc):
    """Однополюсный ФНЧ; fc — число или массив частот среза (Гц) на каждый сэмпл."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    a = 1.0 - np.exp(-2.0 * np.pi * fc / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s += a[i] * (x[i] - s)
        y[i] = s
    return y


def lp2(x, fc):
    """Два ФНЧ подряд (12 дБ/окт.) — звук менее шипящий."""
    return lowpass(lowpass(x, fc), fc)


def bandpass(x, fc, width=1.7):
    return lp2(x, fc * width) - lp2(x, fc / width)


def soft_noise(n):
    """Белый шум, смягчённый (без ультра-высоких)."""
    return lowpass(noise(n), 7000)


def sweep(f0, f1, n):
    """Экспоненциальный ход частоты от f0 до f1."""
    return f0 * (f1 / f0) ** (np.arange(n) / max(1, n - 1))


def fade(x, ms_in=2.0, ms_out=8.0):
    x = x.copy()
    a, b = int(SR * ms_in / 1000), int(SR * ms_out / 1000)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def norm(x, peak=0.7):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


# верхний срез по категориям (Гц): подгонка яркости под демо-ролик; None — без среза
CUTOFF = {"shimmer": 12500, "blur_out": 12500, "morph": 8500, "counter": 9000, "click": 9000,
          "scale_down": 7000, "whoosh": 9500, "rise": 10500}


def save(cat, name, x):
    d = os.path.join(OUT, cat)
    os.makedirs(d, exist_ok=True)
    if CUTOFF.get(cat):
        x = lp2(x, CUTOFF[cat])
    x = np.clip(norm(fade(x)), -1, 1)
    with wave.open(os.path.join(d, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def airy(n, lo, hi):
    """Воздушный шум между lo и hi Гц (числа или массивы)."""
    x = noise(n)
    return lp2(x, hi) - lp2(x, lo)


def whoosh(d, f0, f1, peak=0.4, body=0.18):
    """Яркий взмах: полоса шума ездит от f0 к f1, снизу чуть гула."""
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    env = np.sin(np.pi * t ** (0.6 + peak)) ** 2
    c = sweep(f0, f1, n)
    return (airy(n, c * 0.55, c * 1.9) + body * lp2(noise(n), 400)) * env


def pop(f0, f1, d=0.09, k=40.0):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * k)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 45) + 0.25 * noise(len(t)) * np.exp(-t * 900)


def hit(d, f_low, f_high):
    t = tt(d)
    f = f_low + (f_high - f_low) * np.exp(-t * 18)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * (7 if d < 0.6 else 5))
    thump = lowpass(noise(len(t)), 2500) * np.exp(-t * 60) * 0.8
    return body + thump


def tick(f, d=0.012):
    """Яркий короткий тик: высокочастотный шум + тон."""
    t = tt(d)
    nz = noise(len(t))
    hp = nz - lp2(nz, 3000)
    return 0.8 * hp * np.exp(-t * 500) + 0.5 * np.sin(2 * np.pi * f * t) * np.exp(-t * 700)


def click(f, d=0.03):
    return tick(f, d)


def rise(d, f0=1500, f1=12000):
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    c = sweep(f0, f1, n)
    return (airy(n, c * 0.6, c * 1.8) * t ** 2
            + np.sin(2 * np.pi * np.cumsum(sweep(300, 2500, n)) / SR) * t ** 3 * 0.25)


def sparkles(d, count, f_lo=5000, f_hi=11000, spread=0.8):
    """Россыпь коротких высоких «звёздочек» (хвост блеска)."""
    n = int(SR * d)
    x = np.zeros(n)
    for _ in range(count):
        t0 = RNG.uniform(0, d * spread)
        f = RNG.uniform(f_lo, f_hi)
        m = np.arange(int(SR * 0.012)) / SR
        ping = np.sin(2 * np.pi * f * m) * np.exp(-m * 450) * RNG.uniform(0.3, 1.0)
        i = int(t0 * SR)
        x[i:i + len(ping)] += ping[:max(0, n - i)]
    return x


def shimmer(d, gliss=False, sparkle=45):
    """Блеск появления: воздушная яркая вспышка + искрящийся хвост."""
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    c = sweep(3500, 8500, n) if gliss else np.full(n, 6500.0)
    body = airy(n, c * 0.6, c * 1.7) * np.minimum(1, t * d / 0.02) * np.exp(-t * 4.0)
    return body + 0.9 * sparkles(d, sparkle) * np.exp(-t * 1.6)


def morph(d, f0, f1):
    """Смена слова: короткий щелчок + яркий взмах (полоса шума ездит f0→f1)."""
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    c = sweep(f0, f1, n)
    sw = airy(n, c * 0.6, c * 1.8) * np.sin(np.pi * t) ** 1.2
    x = sw.copy()
    cl = tick(2600, 0.012)
    x[:len(cl)] += 0.9 * cl
    return x


def counter(ticks, d, f0=2200, f1=3800):
    """Счётчик: ускоряющаяся череда ярких тиков."""
    n = int(SR * d)
    x = np.zeros(n)
    pos = np.linspace(0, 1, ticks) ** 0.75
    for i, p in enumerate(pos):
        c = tick(f0 + (f1 - f0) * i / max(1, ticks - 1), 0.014)
        s = int(p * (n - len(c)))
        x[s:s + len(c)] += c * (0.6 + 0.4 * i / ticks)
    return x


def blur_out(d, f0=3500, f1=8000):
    """Уход в блюр: нарастающий яркий свист + низкий гул, резкий срез в конце."""
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    c = sweep(f0, f1, n)
    swell = airy(n, c * 0.6, c * 1.7) * t ** 1.4
    rumble = lp2(noise(n), 350) * np.exp(-t * 4.5) * 0.9
    x = swell + rumble
    cut = int(SR * 0.012)
    x[-cut:] *= np.linspace(1, 0, cut)
    return x


def scale_down(d, f0=5500, f1=1800):
    """Масштаб вниз: воздушный взмах вниз по частоте + низкий толчок."""
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    c = sweep(f0, f1, n)
    air = airy(n, c * 0.55, c * 1.8) * np.minimum(1, t / 0.06) * np.exp(-t * 4.0)
    tb = tt(d)
    body = np.sin(2 * np.pi * np.cumsum(60 + 110 * np.exp(-tb * 14)) / SR) * np.exp(-tb * 9) * 0.55
    return air + body


def glitch(d, bits=5, seed=1):
    r = np.random.default_rng(seed)
    n = int(SR * d)
    x = np.zeros(n)
    i = 0
    while i < n:
        seg = int(SR * r.uniform(0.004, 0.03))
        if r.random() < 0.65:
            f = r.uniform(300, 4000)
            seg_t = np.arange(min(seg, n - i)) / SR
            x[i:i + len(seg_t)] = np.sign(np.sin(2 * np.pi * f * seg_t)) * r.uniform(0.3, 1)
        i += seg + int(SR * r.uniform(0.0, 0.012))
    q = 2 ** (bits - 1)
    return np.round(x * q) / q * np.linspace(1, 0.2, n)


def main():
    for old in glob.glob(os.path.join(OUT, "*", "*.wav")):   # убираем файлы прошлой генерации
        os.remove(old)
    for i, (d, a, b) in enumerate([(0.45, 1200, 6500), (0.35, 7000, 1500), (0.6, 2500, 5500)], 1):
        save("whoosh", "whoosh_%d" % i, whoosh(d, a, b))
    for i, (a, b) in enumerate([(900, 300), (1200, 450), (700, 220)], 1):
        save("pop", "pop_%d" % i, pop(a, b))
    save("hit", "hit_1", hit(0.5, 45, 120))
    save("hit", "hit_2_heavy", hit(0.8, 35, 90))
    for i, f in enumerate([2800, 3600, 4400], 1):
        save("click", "click_%d" % i, click(f))
    save("rise", "rise_1", rise(0.6, 1200, 9000))
    save("rise", "rise_2_long", rise(0.95, 900, 10000))
    save("shimmer", "shimmer_1", shimmer(1.3))
    save("shimmer", "shimmer_2_gliss", shimmer(1.2, gliss=True, sparkle=60))
    save("morph", "morph_1", morph(0.4, 2800, 7000))
    save("morph", "morph_2_down", morph(0.4, 7000, 2800))
    save("counter", "counter_1", counter(16, 0.7))
    save("counter", "counter_2_slow", counter(10, 0.6, 1800, 3000))
    save("blur_out", "blur_out_1", blur_out(0.95))
    save("blur_out", "blur_out_2_short", blur_out(0.65, 4500, 9000))
    save("scale_down", "scale_down_1", scale_down(0.5))
    save("scale_down", "scale_down_2", scale_down(0.6, 5000, 1500))
    save("glitch", "glitch_1", glitch(0.3, 5, 1))
    save("glitch", "glitch_2", glitch(0.25, 4, 2))
    print("готово:", OUT)


if __name__ == "__main__":
    main()
