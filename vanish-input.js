/* Vanishing input
   Effect after Aceternity UI's placeholders-and-vanish-input, itself after
   Rauno's vanish input. Rewritten in vanilla JS.

   The text is drawn to a canvas and sampled into one square per lit pixel.
   A threshold sweeps across it; particles it has passed start a random walk
   and shrink until they're gone. The jitter is what makes it read as
   disintegration rather than a wipe. */

(function () {
    var SWEEP_MS = 1500;   // time for the front to cross the whole text
    var DRIFT_X = 1.2;     // px a loose particle drifts right each frame
    var JITTER = 1.0;      // random walk on top of that
    var SPREAD = 1.0;      // vertical scatter
    var DECAY = 0.094;     // how fast a particle shrinks
    var REST_MS = 2000;    // pause before the placeholder returns

    function init(form) {
        var input = form.querySelector('input');
        if (!input) return;

        var canvas = document.createElement('canvas');
        canvas.className = 'vanish-canvas';
        input.parentNode.insertBefore(canvas, input);

        var ctx = canvas.getContext('2d');
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var particles = [];
        var running = false;
        var pos = 0;
        var restTimer = null;
        var pending = '';
        var sweepStep = 6;
        var passThrough = form.hasAttribute('data-vanish-submit');

        function sizeCanvas() {
            var r = input.getBoundingClientRect();
            var host = canvas.offsetParent || form;
            var hr = host.getBoundingClientRect();

            canvas.width = Math.max(1, Math.round(r.width * dpr));
            canvas.height = Math.max(1, Math.round(r.height * dpr));
            canvas.style.width = r.width + 'px';
            canvas.style.height = r.height + 'px';

            // sit exactly over the input wherever the layout puts it
            canvas.style.left = r.left - hr.left + 'px';
            canvas.style.top = r.top - hr.top + 'px';
        }

        function sample() {
            var text = pending || input.value;
            if (!text) return [];

            sizeCanvas();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            var cs = getComputedStyle(input);
            ctx.font = cs.fontWeight + ' ' + parseFloat(cs.fontSize) * dpr + 'px ' + cs.fontFamily;
            ctx.fillStyle = cs.color;
            ctx.textBaseline = 'middle';
            ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : parseFloat(cs.letterSpacing) * dpr + 'px';

            // match the input's own text origin, or the swap shifts sideways
            var padL = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
            ctx.fillText(text, padL * dpr, canvas.height / 2);

            var img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            var out = [];

            // every lit pixel, antialiasing included - a coarser grid would
            // redraw the text chunkier than the DOM had it, which shows as a
            // pop the moment the canvas takes over
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

        function clearField() {
            if (passThrough) {
                // let the submit handler read the value first
                setTimeout(function () {
                    input.value = '';
                    input.blur();
                }, 0);
            } else {
                input.value = '';
                input.blur();
            }
        }

        function paintSolid() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (var i = 0; i < particles.length; i++) {
                var p = particles[i];
                ctx.fillStyle = p.colour + p.a + ')';
                ctx.fillRect(p.x, p.y, p.r, p.r);
            }
        }

        function frame() {
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

            if (particles.length) {
                requestAnimationFrame(frame);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                form.classList.remove('is-vanishing');
                running = false;
            }
        }

        function vanish() {
            pending = input.value;
            if (running || !pending) return;

            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                clearField();
                form.classList.add('is-resting');
                clearTimeout(restTimer);
                restTimer = setTimeout(function () {
                    form.classList.remove('is-resting');
                }, REST_MS);
                return;
            }

            particles = sample();
            if (!particles.length) return;

            running = true;

            // rightmost lit pixel, so the front starts on the text rather than
            // out in the empty part of the field
            var maxX = 0;
            for (var j = 0; j < particles.length; j++) {
                if (particles[j].seed > maxX) maxX = particles[j].seed;
            }

            pos = maxX + 2;
            sweepStep = Math.max(maxX / (SWEEP_MS / 16.67), 0.5);

            // paint the solid text first, then hide the real one in the same
            // tick - otherwise there is a frame with neither on screen
            paintSolid();
            form.classList.add('is-vanishing', 'is-resting');
            clearField();

            clearTimeout(restTimer);
            restTimer = setTimeout(function () {
                form.classList.remove('is-resting');
            }, REST_MS);

            pending = '';
            requestAnimationFrame(frame);
        }

        // On a Webflow form, let Webflow's own handler run so the address is
        // still collected.
        form.addEventListener('submit', function (e) {
            if (!passThrough) e.preventDefault();
            vanish();
        }, passThrough ? { capture: true } : false);

        input.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            if (passThrough) return; // let the form submit normally
            e.preventDefault();
            vanish();
        });

        window.addEventListener('resize', function () {
            if (!running) sizeCanvas();
        });

        sizeCanvas();
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
