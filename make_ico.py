from PIL import Image
import sys

img = Image.open('icon-512.png')
img.save('icon.ico', format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)])
