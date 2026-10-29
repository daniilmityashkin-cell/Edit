"""NOIR CAPTIONS — генератор стартового набора звуков (синтез, без чужих сэмплов и авторских прав).

    python sfx/generate_sfx.py            # перезаписывает папки sfx/<категория>/*.wav

Нужен numpy. Готовые .wav уже лежат в репозитории — запускать скрипт нужно только чтобы пересоздать их.
Это простые синтезированные звуки «для начала»; свои профессиональные паки кладите в папку:
  <проект>/sfx/<категория>/файл.wav      или      %APPDATA%\\NOIR Captions\\sfx\\<категория>\\файл.wav
Названия категорий: whoosh, pop, hit, click, rise, shimmer, morph, counter, blur_out, scale_down, glitch
(любые другие имена папок тоже работают).
"""
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


def save(cat, name, x):
    d = os.path.join(OUT, cat)
    os.makedirs(d, exist_ok=True)
    x = np.clip(norm(fade(x)), -1, 1)
    with wave.open(os.path.join(d, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def whoosh(d, f0, f1, peak=0.4):
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    env = np.sin(np.pi * t ** (0.6 + peak)) ** 2
    return bandpass(soft_noise(n), sweep(f0, f1, n)) * env


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


def click(f, d=0.03):
    t = tt(d)
    return (0.85 * np.sin(2 * np.pi * f * t) * np.exp(-t * 450)
            + 0.15 * lowpass(noise(len(t)), 5000) * np.exp(-t * 900))


def rise(d, f0=300, f1=4000):
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    nz = bandpass(soft_noise(n), sweep(f0, f1, n)) * t ** 2
    tone = np.sin(2 * np.pi * np.cumsum(sweep(f0 * 0.6, f1 * 0.25, n)) / SR) * t ** 3 * 0.35
    return nz + tone


def shimmer(d, base, sparkle=0):
    t = tt(d)
    x = np.zeros_like(t)
    for k, amp in zip((1, 1.5, 2, 2.5, 3), (1, .7, .5, .4, .3)):
        vib = 1 + 0.003 * np.sin(2 * np.pi * (5 + k) * t)
        x += amp * np.sin(2 * np.pi * base * k * vib * t)
    x *= np.minimum(1, t / 0.01) * np.exp(-t * 5.5)
    for _ in range(sparkle):
        t0 = RNG.uniform(0, d * 0.7)
        f = RNG.uniform(3500, 8000)
        m = (t >= t0)
        x += 0.5 * m * np.sin(2 * np.pi * f * (t - t0)) * np.exp(-(t - t0) * 40) * m
    return x


def morph(d, f0, f1):
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    tone = np.sin(2 * np.pi * np.cumsum(sweep(f0, f1, n)) / SR)
    tone2 = np.sin(2 * np.pi * np.cumsum(sweep(f0 * 1.5, f1 * 1.5, n)) / SR) * 0.4
    sw = bandpass(soft_noise(n), sweep(f0 * 2, f1 * 3, n)) * 0.25
    env = np.sin(np.pi * t) ** 1.5
    return (tone + tone2 + sw) * env


def counter(ticks, d, f0=1500, f1=3000):
    n = int(SR * d)
    x = np.zeros(n)
    pos = np.linspace(0, 1, ticks) ** 0.8
    for i, p in enumerate(pos):
        c = click(f0 + (f1 - f0) * i / max(1, ticks - 1), 0.02)
        s = int(p * (n - len(c)))
        x[s:s + len(c)] += c
    return x


def blur_out(d, f0=5000, f1=250):
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    return lp2(soft_noise(n), sweep(f0, f1, n)) * np.exp(-t * 3.2) * (1 - t) ** 0.5


def scale_down(d, f0, f1):
    n = int(SR * d)
    t = np.linspace(0, 1, n)
    tone = np.sin(2 * np.pi * np.cumsum(sweep(f0, f1, n)) / SR) * np.exp(-t * 3.5)
    air = bandpass(soft_noise(n), sweep(f0 * 2, f1 * 2, n)) * np.exp(-t * 5) * 0.5
    return tone + air


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
    for i, (d, a, b) in enumerate([(0.45, 400, 3500), (0.35, 3500, 500), (0.6, 600, 2500)], 1):
        save("whoosh", "whoosh_%d" % i, whoosh(d, a, b))
    for i, (a, b) in enumerate([(900, 300), (1200, 450), (700, 220)], 1):
        save("pop", "pop_%d" % i, pop(a, b))
    save("hit", "hit_1", hit(0.5, 45, 120))
    save("hit", "hit_2_heavy", hit(0.8, 35, 90))
    for i, f in enumerate([1800, 2500, 3200], 1):
        save("click", "click_%d" % i, click(f))
    save("rise", "rise_1", rise(0.6))
    save("rise", "rise_2_long", rise(0.95, 250, 5000))
    save("shimmer", "shimmer_1", shimmer(0.8, 1800))
    save("shimmer", "shimmer_2_sparkle", shimmer(0.9, 2100, sparkle=7))
    save("morph", "morph_1", morph(0.2, 400, 900))
    save("morph", "morph_2_down", morph(0.22, 900, 350))
    save("counter", "counter_1", counter(10, 0.55))
    save("counter", "counter_2_fast", counter(14, 0.5, 1800, 3600))
    save("blur_out", "blur_out_1", blur_out(0.55))
    save("blur_out", "blur_out_2_long", blur_out(0.85, 4200, 200))
    save("scale_down", "scale_down_1", scale_down(0.4, 700, 130))
    save("scale_down", "scale_down_2", scale_down(0.5, 500, 90))
    save("glitch", "glitch_1", glitch(0.3, 5, 1))
    save("glitch", "glitch_2", glitch(0.25, 4, 2))
    print("готово:", OUT)


if __name__ == "__main__":
    main()
