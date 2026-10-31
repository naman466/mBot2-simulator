// Python sources of the modules mBlock programs import (cyberpi, mbot2, mbuild,
// event, time). They mirror Makeblock's MicroPython API names and defaults and
// forward every call to the simulator through the `_sim` bridge module.

const CYBERPI = String.raw`
import _sim
import event
import mbot2
import mbuild

def _c(name, *args):
    return _sim.invoke(name, *args)

class _Console:
    def print(self, message):
        _c('console.print', str(message))
    def println(self, message):
        _c('console.println', str(message))
    def clear(self):
        _c('console.clear')
    def set_font(self, size):
        _c('console.set_font', size)

class _Display:
    def set_brush(self, r=0, g=0, b=0):
        _c('display.set_brush', r, g, b)
    def set_title_color(self, r=0, g=0, b=0):
        pass
    def rotate_to(self, angle):
        _c('display.rotate_to', angle)
    def clear(self):
        _c('display.clear')
    def off(self):
        _c('display.clear')
    def label(self, message, size=16, x=0, y=0, new_flag=False):
        _c('display.label', str(message), size, x, y)
    def show_label(self, message, size=16, x=0, y=0, new_flag=False):
        _c('display.label', str(message), size, x, y)

class _Chart:
    def set_name(self, name):
        _c('chart.set_name', str(name))
    def clear(self):
        _c('chart.clear')

class _LineChart:
    def add(self, data):
        _c('linechart.add', data)
    def set_step(self, step):
        _c('linechart.set_step', step)

class _BarChart:
    def add(self, data):
        _c('barchart.add', data)

class _Table:
    def add(self, row, column, data):
        _c('table.add', row, column, str(data))

class _Led:
    def on(self, r=0, g=0, b=0, id='all'):
        _c('led.on', r, g, b, id)
    def play(self, name='rainbow'):
        _c('led.play', name)
    def show(self, color, offset=0):
        _c('led.show', color, offset)
    def move(self, step=1):
        _c('led.move', step)
    def off(self, id='all'):
        _c('led.off', id)
    def add_bri(self, brightness):
        _c('led.add_bri', brightness)
    def set_bri(self, brightness):
        _c('led.set_bri', brightness)
    def get_bri(self):
        return _c('led.get_bri')

class _Audio:
    def play(self, music_name):
        _c('audio.play', music_name, False)
    def play_until(self, music_name):
        _c('audio.play', music_name, True)
    def record(self):
        pass
    def stop_record(self):
        pass
    def play_record(self):
        pass
    def play_record_until(self):
        pass
    def play_tone(self, freq, t=None):
        _c('audio.play_tone', freq, t)
    def play_drum(self, type, beat):
        _c('audio.play_drum', type, beat)
    def play_music(self, note, beat, type='piano'):
        _c('audio.play_note', note, beat)
    def play_note(self, note, beat):
        _c('audio.play_note', note, beat)
    def add_tempo(self, pct):
        _c('audio.add_tempo', pct)
    def set_tempo(self, pct):
        _c('audio.set_tempo', pct)
    def get_tempo(self):
        return _c('audio.get_tempo')
    def add_vol(self, val):
        _c('audio.add_vol', val)
    def set_vol(self, val):
        _c('audio.set_vol', val)
    def get_vol(self):
        return _c('audio.get_vol')
    def stop(self):
        _c('audio.stop')

class _Controller:
    def is_press(self, name):
        return _c('controller.is_press', name)
    def get_count(self, name):
        return _c('controller.get_count', name)
    def reset_count(self, name):
        _c('controller.reset_count', name)

class _Timer:
    def get(self):
        return _c('timer.get')
    def reset(self):
        _c('timer.reset')

class _Broadcast:
    def __init__(self, kind):
        self._kind = kind
    def set(self, message, value=''):
        _c('broadcast.set', self._kind, str(message), value)
    def get(self, message):
        return _c('broadcast.get', self._kind, str(message))

class _Wifi:
    def connect(self, ssid, password):
        _c('offline', 'Wi-Fi')
    def is_connect(self):
        return False

class _Cloud:
    def setkey(self, key):
        pass
    def weather(self, option, woe_id):
        return _c('offline', 'weather')
    def air(self, option, woe_id):
        return _c('offline', 'air quality')
    def time(self, option, location=0):
        return _c('cloud.time', option)
    def listen(self, language, t=3):
        _c('offline', 'speech recognition')
    def listen_result(self):
        return ''
    def tts(self, language, message):
        _c('speak', str(message), language)
    def translate(self, language, message):
        _c('offline', 'translate')
        return message

console = _Console()
display = _Display()
chart = _Chart()
linechart = _LineChart()
barchart = _BarChart()
table = _Table()
led = _Led()
audio = _Audio()
controller = _Controller()
timer = _Timer()
wifi = _Wifi()
cloud = _Cloud()
wifi_broadcast = _Broadcast('wifi')
upload_broadcast = _Broadcast('upload')
cloud_broadcast = _Broadcast('cloud')
quad_rgb_sensor = mbuild.quad_rgb_sensor
ultrasonic2 = mbuild.ultrasonic2

def broadcast(message):
    _c('broadcast', str(message))

def broadcast_and_wait(message):
    _c('broadcast', str(message))

def get_bri():
    return _c('sensor.brightness')

def get_brightness():
    return _c('sensor.brightness')

def get_loudness(mode='maximum'):
    return _c('sensor.loudness')

def is_tiltforward():
    return _c('sensor.attitude', 'forward')
def is_tiltback():
    return _c('sensor.attitude', 'backward')
def is_tiltleft():
    return _c('sensor.attitude', 'left')
def is_tiltright():
    return _c('sensor.attitude', 'right')
def is_faceup():
    return _c('sensor.attitude', 'faceup')
def is_facedown():
    return False
def is_stand():
    return False
def is_handstand():
    return False
def is_shake():
    return False
def is_waveup():
    return False
def is_wavedown():
    return False
def is_waveleft():
    return False
def is_waveright():
    return False
def is_freefall():
    return False
def is_clockwise():
    return _c('sensor.turning', 'clockwise')
def is_anticlockwise():
    return _c('sensor.turning', 'anticlockwise')
def get_shakeval():
    return 0
def get_wave_angle():
    return 0
def get_wave_speed():
    return 0
def get_pitch():
    return _c('sensor.pitch')
def get_roll():
    return _c('sensor.roll')
def get_yaw():
    return _c('sensor.rotation', 'z')
def reset_yaw():
    _c('sensor.reset_rotation', 'z')
def get_acc(axis):
    return _c('sensor.acc', axis)
def get_gyro(axis):
    return _c('sensor.gyro', axis)
def get_rotation(axis):
    return _c('sensor.rotation', axis)
def reset_rotation(axis='all'):
    _c('sensor.reset_rotation', axis)

def get_mac_address():
    return '001122334455'
def get_battery():
    return 100
def get_firmware_version():
    return 'simulator'
def get_ble():
    return 'Makeblock_LE001b10'
def get_name():
    return _c('device.get_name')
def set_name(name):
    _c('device.set_name', str(name))
def get_language():
    return 'english'

def stop_all():
    _c('script.stop_all')
def stop_this():
    _c('script.stop_this')
def stop_other():
    _c('script.stop_other')
def restart():
    _c('script.restart')
`;

const MBOT2 = String.raw`
import _sim

def _c(name, *args):
    return _sim.invoke(name, *args)

def forward(speed=50, run_time=None):
    _c('mbot2.move', 'forward', speed, run_time)
def backward(speed=50, run_time=None):
    _c('mbot2.move', 'backward', speed, run_time)
def turn_left(speed=50, run_time=None):
    _c('mbot2.move', 'left', speed, run_time)
def turn_right(speed=50, run_time=None):
    _c('mbot2.move', 'right', speed, run_time)
def straight(distance, speed=50):
    _c('mbot2.straight', distance, speed)
def turn(angle, speed=50):
    _c('mbot2.turn', angle, speed)
def drive_power(EM1_power, EM2_power):
    _c('mbot2.drive', 'power', EM1_power, EM2_power)
def drive_speed(EM1_speed, EM2_speed):
    _c('mbot2.drive', 'speed', EM1_speed, EM2_speed)
def EM_set_power(power, port='all'):
    _c('mbot2.em_set', 'power', power, port)
def EM_set_speed(speed, port='all'):
    _c('mbot2.em_set', 'speed', speed, port)
def EM_turn(angle, speed=50, port='all'):
    _c('mbot2.em_turn', angle, speed, port)
def EM_get_angle(port='EM1'):
    return _c('mbot2.em_get', 'angle', port)
def EM_get_speed(port='EM1'):
    return _c('mbot2.em_get', 'speed', port)
def EM_get_power(port='EM1'):
    return _c('mbot2.em_get', 'power', port)
def EM_reset_angle(port='all'):
    _c('mbot2.em_reset_angle', port)
def EM_lock(is_lock=True, port='all'):
    pass
def EM_stop(port='all'):
    _c('mbot2.em_stop', port)

def motor_set(power, port='M1'):
    _c('ports.motor_set', port, power)
def motor_add(power, port='M1'):
    _c('ports.motor_add', port, power)
def motor_get(port='M1'):
    return _c('ports.motor_get', port)
def motor_drive(power1, power2):
    _c('ports.motor_set', 'M1', power1)
    _c('ports.motor_set', 'M2', power2)
def motor_stop(port='all'):
    _c('ports.motor_stop', port)
def servo_set(angle, port='S1'):
    _c('ports.servo_set', port, angle)
def servo_add(angle, port='S1'):
    _c('ports.servo_add', port, angle)
def servo_get(port='S1'):
    return _c('ports.servo_get', port)
def servo_release(port='S1'):
    pass
def servo_drive(angle1, angle2, angle3=0, angle4=0):
    for port, angle in (('S1', angle1), ('S2', angle2), ('S3', angle3), ('S4', angle4)):
        _c('ports.servo_set', port, angle)
def led_on(r=0, g=0, b=0, id='all', port='S1'):
    pass
def led_off(id='all', port='S1'):
    pass
def write_digital(val, port='S1'):
    _c('ports.pin_set', port, val)
def read_digital(port='S1'):
    return _c('ports.pin_get', port) > 0
def set_pwm(duty, frequency=2000, port='S1'):
    _c('ports.pin_set', port, duty)
def read_analog(port='S1'):
    return 0
`;

const MBUILD = String.raw`
import _sim

def _c(name, *args):
    return _sim.invoke(name, *args)

class _QuadRGB:
    def get_line_sta(self, ch='all', index=1):
        return _c('quad.line_sta', ch)
    def get_offset_track(self, index=1):
        return _c('quad.offset')
    def is_line(self, ch='any', index=1):
        return _c('quad.is', ch, 'line')
    def is_background(self, ch='any', index=1):
        return _c('quad.is', ch, 'background')
    def is_color(self, color='white', ch='any', index=1):
        return _c('quad.is', ch, color)
    def get_color_sta(self, ch='L1', index=1):
        return _c('quad.color', ch)
    def get_color(self, ch='L1', index=1):
        return _c('quad.color', ch)
    def get_red(self, ch='L1', index=1):
        return _c('quad.value', ch, 'red')
    def get_green(self, ch='L1', index=1):
        return _c('quad.value', ch, 'green')
    def get_blue(self, ch='L1', index=1):
        return _c('quad.value', ch, 'blue')
    def get_gray(self, ch='L1', index=1):
        return _c('quad.value', ch, 'gray')
    def get_light(self, ch='L1', index=1):
        return _c('quad.value', ch, 'light')
    def set_led(self, color='white', index=1):
        _c('quad.led', color)
    def off_led(self, index=1):
        _c('quad.led', None)
    def calibrate(self, index=1):
        pass

class _Ultrasonic2:
    def get(self, index=1):
        return _c('ultrasonic.get')
    def is_out_of_range(self, index=1):
        return _c('ultrasonic.get') >= 300
    def set_bri(self, brightness, id='all', index=1):
        _c('ultrasonic.set_bri', brightness, id)
    def add_bri(self, brightness, id='all', index=1):
        _c('ultrasonic.add_bri', brightness, id)
    def get_bri(self, id=1, index=1):
        return _c('ultrasonic.get_bri', id)
    def off_led(self, id='all', index=1):
        _c('ultrasonic.set_bri', 0, id)
    def play(self, emotion, index=1):
        _c('ultrasonic.play', emotion)

quad_rgb_sensor = _QuadRGB()
ultrasonic2 = _Ultrasonic2()
`;

const EVENT = String.raw`
import _sim

def start(f):
    _sim.register('start', '', f)
    return f

def _with_arg(kind, arg):
    def deco(f):
        _sim.register(kind, arg, f)
        return f
    return deco

def is_press(name):
    return _with_arg('is_press', name)
def receive(message):
    return _with_arg('receive', str(message))
def received(message):
    return _with_arg('receive', str(message))
def cloud_message(message):
    return _with_arg('cloud', str(message))
def upload_message(message):
    return _with_arg('upload', str(message))
def wifi_message(message):
    return _with_arg('wifi', str(message))
def greater_than(threshold, type='microphone'):
    return _with_arg('greater_than', [threshold, type])
def smaller_than(threshold, type='microphone'):
    return _with_arg('smaller_than', [threshold, type])

def is_tiltforward(f):
    _sim.register('attitude', 'forward', f)
    return f
def is_tiltback(f):
    _sim.register('attitude', 'backward', f)
    return f
def is_tiltleft(f):
    _sim.register('attitude', 'left', f)
    return f
def is_tiltright(f):
    _sim.register('attitude', 'right', f)
    return f
def is_faceup(f):
    _sim.register('attitude', 'faceup', f)
    return f

def _never(f):
    return f
is_facedown = is_shake = is_waveup = is_wavedown = is_waveleft = is_waveright = _never
is_freefall = is_clockwise = is_anticlockwise = is_stand = is_handstand = _never
`;

const TIME = String.raw`
import _sim

def sleep(seconds):
    _sim.invoke('sleep', seconds)
def sleep_ms(ms):
    _sim.invoke('sleep', ms / 1000)
def sleep_us(us):
    _sim.invoke('sleep', us / 1000000)
def time():
    return _sim.invoke('clock') / 1000
def ticks_ms():
    return int(_sim.invoke('clock'))
def ticks_us():
    return int(_sim.invoke('clock') * 1000)
def ticks_diff(a, b):
    return a - b
def monotonic():
    return _sim.invoke('clock') / 1000
def perf_counter():
    return _sim.invoke('clock') / 1000
`;

/** Module name → Python source. */
export const PYTHON_LIBS: Record<string, string> = {
  cyberpi: CYBERPI,
  mbot2: MBOT2,
  mbuild: MBUILD,
  event: EVENT,
  time: TIME,
  utime: TIME,
};
