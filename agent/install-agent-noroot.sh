#!/system/bin/sh
# (v3.0.5) Installs/updates panel-agent WITHOUT root, from /data/local/tmp into /data/local/tmp/skypane-agent, and
# (re)starts it as adb's shell user. Run over adb (no su):
#   adb shell sh /data/local/tmp/install-agent-noroot.sh
# Push first: panel-agent and start-agent-noroot.sh to /data/local/tmp. Apps can't read /data/local/tmp (only adb's
# shell user and root), so agent.args (the MQTT login) and agent.token stay private there.
# Symlinks are refused (source, target and the directory), so nothing can redirect the mv.
SRC=/data/local/tmp
DIR=/data/local/tmp/skypane-agent

[ -L $DIR ] && { echo "refused: $DIR is a symlink"; exit 1; }
mkdir -p $DIR && chmod 700 $DIR
for f in panel-agent start-agent-noroot.sh; do
    [ -L $SRC/$f ] && { echo "refused: $SRC/$f is a symlink"; exit 1; }
    [ -L $DIR/$f ] && { echo "refused: $DIR/$f is a symlink"; exit 1; }
    [ -f "$SRC/$f" ] || continue
    mv "$SRC/$f" "$DIR/$f" || exit 1
    [ -L "$DIR/$f" ] && { rm -f "$DIR/$f"; echo "refused: $DIR/$f became a symlink (removed)"; exit 1; }
done
chmod 755 $DIR/panel-agent
chmod 644 $DIR/start-agent-noroot.sh
for f in agent.args agent.token agent.server agent.key; do   # the MQTT login, the agent token, the paired server, (v3.0.5) its key
    [ -f $DIR/$f ] && chmod 600 $DIR/$f
done
rm -f $SRC/install-agent.sh $SRC/start-agent.sh $SRC/install-agent-noroot.sh

ls -la $DIR
sh $DIR/start-agent-noroot.sh || exit 1
# the LED strip without root: the agent can drive it only when the strip's driver is open to the shell user
ls -l /dev/ledjni 2>/dev/null || echo "no /dev/ledjni on this tablet (no LED strip driver)"
