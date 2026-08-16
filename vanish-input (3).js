/* Vanishing input
   Effect after Aceternity UI's placeholders-and-vanish-input, itself after
   Rauno's vanish input. Rewritten in vanilla JS.

   Text is drawn to a canvas and sampled into one square per lit pixel. A
   threshold sweeps across it right to left; particles it has passed drift and
   shrink until they're gone. Handles any number of inputs and textareas in one
   form - they all dissolve together on submit. */

(function () {
    var SWEEP_MS = 1500;   // time for the front to cross the widest field
    var DRIFT_X = 1.2;     // px a loose particle drifts right each frame
    var JITTER = 1.0;      // random walk on top of that
    var SPREAD = 1.0;      // vertical scatter
    var DECAY = 0.094;     // how fast a particle shrinks
    var REST_MS = 2000;    // pause before the placeholders return

    var FIELDS = 'input[type=text], input[type=email], input:not([type]), textarea';

    function makeField(el, form) {
        var canvas = document.createElement('canvas');
        canvas.className = 'vanish-canvas';
        canvas.style.position = 'absolute';
        canvas.style.left = '0px';
        canvas.style.top = '0px';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '2';
        el.parentNode.insertBefore(canvas, el);

        var ctx = canvas.getContext('2d');
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var particles = [];
        var pos = 0;
        var sweepStep = 6;
        var held = '';

        function sizeCanvas() {
            var r = el.getBoundingClientRect();
            var host = canvas.offsetParent || form;
            var hr = host.getBoundingClientRect();

            canvas.width = Math.max(1, Math.round(r.width * dpr));
            canvas.height = Math.max(1, Math.round(r.height * dpr));
            canvas.style.width = r.width + 'px';
            canvas.style.height = r.height + 'px';
            canvas.style.left = r.left - hr.left + 'px';
            canvas.style.top = r.top - hr.top + 'px';
        }

        // a textarea wraps, so the text has to be broken the same way here
        function wrap(text, maxWidth) {
            var out = [];
            text.split('\n').forEach(function (para) {
                var words = para.split(' ');
                var line = '';
                words.forEach(function (w) {
                    var test = line ? line + ' ' + w : w;
                    if (ctx.measureText(test).width > maxWidth && line) {
                        out.push(line);
                        line = w;
                    } else {
                        line = test;
                    }
                });
                out.push(line);
            });
            return out;
        }

        function sample() {
            var text = el.value;
            if (!text) return [];

            sizeCanvas();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            var cs = getComputedStyle(el);
            ctx.font = cs.fontWeight + ' ' + parseFloat(cs.fontSize) * dpr + 'px ' + cs.fontFamily;
            ctx.fillStyle = cs.color;
            ctx.textBaseline = 'middle';
            ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : parseFloat(cs.letterSpacing) * dpr + 'px';

            var padL = ((parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0)) * dpr;
            var padT = ((parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0)) * dpr;
            var lh = (parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 14) * 1.35) * dpr;

            if (el.tagName === 'TEXTAREA') {
                wrap(text, canvas.width - padL).forEach(function (line, i) {
                    ctx.fillText(line, padL, padT + lh * (i + 0.5));
                });
            } else {
                ctx.fillText(text, padL, canvas.height / 2);
            }

            var img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            var out = [];

            for (var y = 0; y < canvas.height; y++) {
                for (var x = 0; x < canvas.width; x++) {
                    var i = (y * canvas.width + x) * 4;
                    var a = img[i + 3];
                    if (!a) continue;

                    out.push({
                        x: x,
                        y: y,
                        seed: x,
                        r: 1,
                        a: a / 255,
                        colour: 'rgba(' + img[i] + ',' + img[i + 1] + ',' + img[i + 2] + ',',
                    });
                }
            }
            return out;
        }

        function paintSolid() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (var i = 0; i < particles.length; i++) {
                var p = particles[i];
                ctx.fillStyle = p.colour + p.a + ')';
                ctx.fillRect(p.x, p.y, p.r, p.r);
            }
        }

        function hideText() {
            held = el.placeholder;
            el.placeholder = '';
            el.style.color = 'transparent';
            el.style.caretColor = 'transparent';
        }

        function restore() {
            el.value = '';
            el.blur();
            el.style.color = '';
            el.style.caretColor = '';
        }

        return {
            el: el,
            measure: function () {
                particles = sample();
                if (!particles.length) return false;

                var maxX = 0;
                for (var j = 0; j < particles.length; j++) {
                    if (particles[j].seed > maxX) maxX = particles[j].seed;
                }

                pos = maxX + 2;
                sweepStep = Math.max(maxX / (SWEEP_MS / 16.67), 0.5);

                paintSolid();
                return true;
            },
            conceal: function () {
                if (!el.value) return;
                hideText();
                el.blur();
            },
            step: function () {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                var next = [];

                for (var i = 0; i < particles.length; i++) {
                    var p = particles[i];

                    if (p.seed < pos) {
                        ctx.fillStyle = p.colour + p.a + ')';
                        ctx.fillRect(p.x, p.y, p.r, p.r);
                        next.push(p);
                        continue;
                    }

                    p.x += DRIFT_X + (Math.random() > 0.5 ? 1 : -1) * JITTER;
                    p.y += (Math.random() > 0.5 ? 1 : -1) * JITTER * SPREAD;
                    p.r -= DECAY * Math.random() * Math.max(p.r, 1);

                    if (p.r <= 0.06) continue;

                    ctx.fillStyle = p.colour + (p.a * p.r).toFixed(3) + ')';
                    ctx.fillRect(p.x, p.y, p.r, p.r);
                    next.push(p);
                }

                particles = next;
                pos -= sweepStep;
                return particles.length > 0;
            },
            finish: function () {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                restore();
            },
            reset: function () {
                el.placeholder = held;
            },
            resize: sizeCanvas,
        };
    }

    function init(form) {
        var els = form.querySelectorAll(FIELDS);
        if (!els.length) return;

        var fields = [];
        for (var i = 0; i < els.length; i++) fields.push(makeField(els[i], form));

        if (getComputedStyle(form).position === 'static') form.style.position = 'relative';

        var running = false;
        var restTimer = null;
        var passThrough = form.hasAttribute('data-vanish-submit');

        form.noValidate = true;

        function valid() {
            for (var i = 0; i < fields.length; i++) {
                var el = fields[i].el;
                if (typeof el.checkValidity !== 'function') continue;
                if (el.checkValidity()) continue;
                if (typeof el.reportValidity === 'function') el.reportValidity();
                return false;
            }
            return true;
        }

        function anyValue() {
            for (var i = 0; i < fields.length; i++) {
                if (fields[i].el.value) return true;
            }
            return false;
        }

        function frame() {
            var alive = false;
            for (var i = 0; i < fields.length; i++) {
                if (fields[i].step()) alive = true;
            }

            if (alive) {
                requestAnimationFrame(frame);
            } else {
                for (var j = 0; j < fields.length; j++) fields[j].finish();
                form.classList.remove('is-vanishing');
                running = false;
            }
        }

        function vanish() {
            if (running || !anyValue()) return;

            var any = false;
            for (var i = 0; i < fields.length; i++) {
                if (fields[i].measure()) any = true;
            }
            for (var m = 0; m < fields.length; m++) fields[m].conceal();

            form.classList.add('is-vanishing', 'is-resting');

            clearTimeout(restTimer);
            restTimer = setTimeout(function () {
                form.classList.remove('is-resting');
                for (var j = 0; j < fields.length; j++) fields[j].reset();
            }, REST_MS);

            if (!any) {
                form.classList.remove('is-vanishing');
                return;
            }

            running = true;
            requestAnimationFrame(frame);
        }

        function reduced() {
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }

        form.addEventListener(
            'submit',
            function (e) {
                if (!valid()) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (!passThrough) e.preventDefault();

                if (reduced()) {
                    for (var i = 0; i < fields.length; i++) fields[i].finish();
                    return;
                }
                vanish();
            },
            passThrough ? { capture: true } : false
        );

        // Enter submits a single-line field; in a textarea it should make a new line
        for (var k = 0; k < fields.length; k++) {
            (function (f) {
                f.el.addEventListener('keydown', function (e) {
                    if (e.key !== 'Enter') return;
                    if (f.el.tagName === 'TEXTAREA') return;
                    if (passThrough) return;
                    e.preventDefault();
                    if (!valid()) return;
                    vanish();
                });
            })(fields[k]);
        }

        window.addEventListener('resize', function () {
            if (running) return;
            for (var i = 0; i < fields.length; i++) fields[i].resize();
        });

        for (var m = 0; m < fields.length; m++) fields[m].resize();
    }

    function boot() {
        document.querySelectorAll('[data-vanish]').forEach(init);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
