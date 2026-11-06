#!/system/bin/sh
# (v3.0.5) (Re)starts panel-agent WITHOUT root, as adb's shell user:
#   adb shell sh /data/local/tmp/skypane-agent/start-agent-noroot.sh
# Without root it can't use port 852 (below 1024), so it listens on 127.0.0.1:8852; the panel page uses that port
# only when the panel's "LED agent without root" setting is on (Manager → Panels → Setup → General → This tablet).
# Without root nothing can start it after a reboot: run this line again then (docs/guides/led-agent.html).
# The agent reads its settings from agent.args itself (-args), so the MQTT login never shows up in ps.
# (v3.0.5) A new build (the self-update keeps the one before as panel-agent.old) that exits within 10 s of starting
# is put aside as panel-agent.bad and panel-agent.old is started instead; the log says so.
DIR=/data/local/tmp/skypane-agent
BIN=$DIR/panel-agent
LOG=$DIR/panel-agent.log

chmod 755 $BIN
pkill -x panel-agent 2>/dev/null
sleep 1
[ -f $LOG ] && mv $LOG $LOG.old

# setsid + nohup: it keeps running after adb disconnects
start() {
    setsid nohup "$BIN" -args "$DIR/agent.args" -listen 127.0.0.1:8852 >> $LOG 2>&1 < /dev/null &
}
# (v3.0.5) still running 10 s after the start? Else back to the build before it, once.
alive10() {
    i=0
    while [ $i -lt 10 ]; do
        sleep 1
        pgrep -x panel-agent > /dev/null || return 1
        i=$((i + 1))
    done
    return 0
}
start
if ! alive10 && [ -f $BIN.old ] && [ ! -L $BIN.old ]; then
    echo "start-agent: the new build exited within 10 s; going back to panel-agent.old (the new one is kept as panel-agent.bad)" | tee -a $LOG
    mv -f $BIN $BIN.bad && mv -f $BIN.old $BIN && chmod 755 $BIN
    start
    sleep 2
fi
if pgrep -x panel-agent > /dev/null; then
    echo "panel-agent running without root (pid $(pgrep -x panel-agent))"
else
    echo "panel-agent failed to start:"; cat $LOG
    exit 1
fi
