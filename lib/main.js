"use babel";

import { CompositeDisposable } from "atom";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

class vprof {
    constructor() {
        this.subscriptions = null;
        this.running = null;
        this.stats = null;
        this.config = {
            colorSelection: {
                title: "Color line markers using",
                type: "string",
                description: "1 - calls, 2 - exec time, 3 - total time",
                default: "3",
            },
            profileFormat: {
                title: "Per-line profile format",
                type: "string",
                description: "Available keys: %calls, %exec_time, %total_time",
                default: "[%calls] %exec_time"
            },
        };
    }

    activate() {
        this.run();
        this.subscriptions = new CompositeDisposable();
        let commands = atom.commands.add("atom-workspace", {
            "vprof:toggle": this.toggle.bind(this),
        });
        return this.subscriptions.add(commands);
    }

    deactivate() {
        atom.workspace.getTextEditors().forEach((editor) => {
            this.render(editor, []);
        });
        this.running = false;
        this.subscriptions.dispose();
    }

    toggle() {
        this.stats = null;
        if (!this.running) {
            this.running = true;
            this.run();
        } else {
            atom.workspace.getTextEditors().forEach((editor) => {
                this.render(editor, []);
            });
            this.running = false;
        }
    }

    run() {
        let tab = atom.workspace.getActiveTextEditor();
        let file = tab ? tab.buffer.file : null;
        if (!file) {
            this.running = false;
            return;
        }
        let filePath = file.getPath();
        let projectPath = atom.project.relativizePath(filePath)[0];
        if (file.path.slice(-3) !== ".py") {
            atom.notifications.addWarning("Can't profile non-python file");
            this.running = false;
            return;
        }

        // run python script
        let scriptFile = path.resolve(__dirname, "read-stats.py");
        let colorSelection = atom.config.get('pulsar-python-vprof.colorSelection');
        console.log(colorSelection);
        let profileFormat = atom.config.get('pulsar-python-vprof.profileFormat');
        let spawn = require("child_process").spawn;
        let pythonProcess = spawn("python", [scriptFile, projectPath, colorSelection, profileFormat]);
        pythonProcess.stderr.on("data", (data) => {
            atom.notifications.addWarning(data.toString());
            this.stats = null;
            this.running = false;
        });
        let stdout = "";
        pythonProcess.stdout.on("data", (data) => {
            stdout += data.toString();
        });
        pythonProcess.on("close", () => {
            if (stdout) {
                this.stats = JSON.parse(stdout.match("DATA_START(.*)DATA_END")[1]);
                atom.workspace.getTextEditors().forEach((editor) => {
                    this.drawStats(editor, this.stats);
                });
            }
        });

        // for newly oppened files
        atom.workspace.observeTextEditors((editor) => {
            if (this.stats) {
                this.drawStats(editor, this.stats);
            }
        });
    }

    drawStats(editor, stats) {
        if (editor.buffer.file) {
            let path = editor.buffer.file.path;
            let file_stats = [];
            for (let i = 0; i < stats.length; i++) {
                let file = stats[i];
                if (file["file_path"] === path) {
                    file_stats = file.stats;
                    break;
                }
            }
            this.render(editor, file_stats);
        }
    }

    render(editor, lines) {
        //remove gutter
        editor.getMarkers().forEach(function (marker) {
            marker.emitter.emit("vprof:destroy");
        });
        editor
            .getGutters()
            .filter(({ name }) => name === "vprof")
            .forEach((gutter) => {
                gutter.destroy();
            });

        // add gutter
        if (lines.length) {
            editor.addGutter({ name: "vprof" });
            lines.forEach((line) => {
                let color = line[2];

                // create marker
                let lineStats = document.createElement("div");
                lineStats.className = "line-stats";
                if (color) {
                    let markerBg = document.createElement("span");
                    markerBg.className = "background";
                    markerBg.style["background"] = `linear-gradient(
                                        90deg,
                                        rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.1),
                                        rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)
                                )`;
                    lineStats.appendChild(markerBg);
                }
                let textContainer = document.createElement("span");
                textContainer.innerHTML = line[1];
                textContainer.className = "text";
                lineStats.appendChild(textContainer);

                // draw marker
                let marker = editor.markBufferRange([[line[0], 0], [line[0], Infinity]]);
                marker.emitter.on("vprof:destroy", function () {
                    marker.destroy();
                });
                editor.decorateMarker(marker, {
                    type: "gutter",
                    gutterName: "vprof",
                    class: "vprof-gutter",
                    item: lineStats,
                });
            });
        }
    }
}

let instance = new vprof();
export default instance;
