# mferet.com

My personal site: who I am, what I've built, and the stories behind it. Live at **[mferet.com](https://mferet.com)**.

- **Home and About:** my work as a senior software engineer, and how I build with AI coding agents.
- **[Stories](https://mferet.com/projects.html):** my projects and the engineering decisions behind them, like hardware safety interlocks and keeping a Zigbee mesh from flooding on game day.
- **[The Basement](https://mferet.com/basement.html):** an interactive simulator of my home theater automation ([source](https://github.com/MFeret11/home-assistant-config)). Pick a mode and watch the lights, receiver and projector respond.
- **[WeatherTunes](https://mferet.com/WeatherTunes/):** today's forecast as a song ([source](https://github.com/MFeret11/WeatherTunes)).

## How it's built

Hand-written HTML, CSS and JavaScript with no framework and no build step, hosted on GitHub Pages. Light and dark themes follow your system setting and can be toggled. Ideas for what's next are in [BACKLOG.md](BACKLOG.md).

To run it locally:

```bash
python3 -m http.server 8080
# open http://localhost:8080/
```

## License

Apache 2.0. See [License](License).
