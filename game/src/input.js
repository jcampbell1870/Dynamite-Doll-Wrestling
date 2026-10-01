// Keyboard, gamepad and touch input.
// Keyboard: arrows move, A/Space strike, S grapple, D signature, F pin, Esc/P pause.
// Gamepad (standard mapping): left stick / d-pad move, A strike, X grapple,
// Y signature, B pin, Start pause. In menus the d-pad moves focus and A selects.
const KEY_ACTIONS = {
  a: 'strike', ' ': 'strike', s: 'grapple', d: 'signature', f: 'pin'
};

const PAD_ACTIONS = { 0: 'strike', 2: 'grapple', 3: 'signature', 1: 'pin' };

export function createInput({ onAction, onPause, isPlaying, stickElement, buttonElements }) {
  const keys = { left: false, right: false, up: false, down: false };
  const touchMove = { x: 0, z: 0 };
  const padPrevious = {};
  let padMove = { x: 0, z: 0 };
  let padNavCooldown = 0;

  window.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowLeft': keys.left = true; break;
      case 'ArrowRight': keys.right = true; break;
      case 'ArrowUp': keys.up = true; break;
      case 'ArrowDown': keys.down = true; break;
      case 'Escape':
      case 'p':
      case 'P':
        if (!event.repeat) {
          onPause();
        }
        return;
      default: {
        const action = KEY_ACTIONS[event.key.toLowerCase()];
        if (action && isPlaying()) {
          event.preventDefault();
          if (!event.repeat) {
            onAction(action);
          }
        }
        return;
      }
    }
    if (isPlaying()) {
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    switch (event.key) {
      case 'ArrowLeft': keys.left = false; break;
      case 'ArrowRight': keys.right = false; break;
      case 'ArrowUp': keys.up = false; break;
      case 'ArrowDown': keys.down = false; break;
      default: break;
    }
  });

  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.up = keys.down = false;
  });

  // Virtual joystick.
  if (stickElement) {
    const knob = stickElement.querySelector('.knob');
    let pointerId = null;
    const release = () => {
      pointerId = null;
      touchMove.x = 0;
      touchMove.z = 0;
      knob.style.transform = '';
    };
    const moveTo = (event) => {
      const rect = stickElement.getBoundingClientRect();
      const radius = rect.width / 2;
      let dx = (event.clientX - rect.left - radius) / radius;
      let dy = (event.clientY - rect.top - radius) / radius;
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        dx /= length;
        dy /= length;
      }
      touchMove.x = Math.abs(dx) > 0.15 ? dx : 0;
      touchMove.z = Math.abs(dy) > 0.15 ? dy : 0;
      knob.style.transform = 'translate(' + (dx * radius * 0.6) + 'px,' + (dy * radius * 0.6) + 'px)';
    };
    stickElement.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      pointerId = event.pointerId;
      stickElement.setPointerCapture(pointerId);
      moveTo(event);
    });
    stickElement.addEventListener('pointermove', (event) => {
      if (event.pointerId === pointerId) {
        moveTo(event);
      }
    });
    stickElement.addEventListener('pointerup', release);
    stickElement.addEventListener('pointercancel', release);
  }

  (buttonElements || []).forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (isPlaying()) {
        onAction(button.dataset.action);
      }
    });
  });

  function focusables() {
    return Array.from(document.querySelectorAll('.screen.active button:not([disabled]), .screen.active select, .screen.active input'))
      .filter((el) => el.offsetParent !== null);
  }

  function navigate(direction) {
    const list = focusables();
    if (list.length === 0) {
      return;
    }
    const index = list.indexOf(document.activeElement);
    const next = index < 0 ? 0 : (index + direction + list.length) % list.length;
    list[next].focus();
  }

  function pollGamepad(dt) {
    padMove = { x: 0, z: 0 };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    padNavCooldown = Math.max(0, padNavCooldown - dt);
    for (const pad of pads) {
      if (!pad || !pad.connected) {
        continue;
      }
      const pressed = (i) => pad.buttons[i] && pad.buttons[i].pressed;
      const justPressed = (i) => pressed(i) && !padPrevious[pad.index + ':' + i];

      let x = Math.abs(pad.axes[0]) > 0.2 ? pad.axes[0] : 0;
      let z = Math.abs(pad.axes[1]) > 0.2 ? pad.axes[1] : 0;
      if (pressed(14)) { x = -1; }
      if (pressed(15)) { x = 1; }
      if (pressed(12)) { z = -1; }
      if (pressed(13)) { z = 1; }

      if (isPlaying()) {
        padMove = { x, z };
        Object.keys(PAD_ACTIONS).forEach((i) => {
          if (justPressed(Number(i))) {
            onAction(PAD_ACTIONS[i]);
          }
        });
      } else {
        if (padNavCooldown === 0 && (Math.abs(x) > 0.5 || Math.abs(z) > 0.5)) {
          navigate(z > 0.5 || x > 0.5 ? 1 : -1);
          padNavCooldown = 0.2;
        }
        if (justPressed(0) && document.activeElement && document.activeElement.click) {
          document.activeElement.click();
        }
      }

      if (justPressed(9)) {
        onPause();
      }

      pad.buttons.forEach((button, i) => {
        padPrevious[pad.index + ':' + i] = button.pressed;
      });
    }
  }

  return {
    update(dt) {
      pollGamepad(dt);
    },
    // Screen-space move intent mapped onto the ring floor (camera looks down -z).
    move() {
      let x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + touchMove.x + padMove.x;
      let z = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + touchMove.z + padMove.z;
      x = Math.max(-1, Math.min(1, x));
      z = Math.max(-1, Math.min(1, z));
      return { moveX: x, moveZ: z };
    }
  };
}
