# Read KEY=value from an env file without bash "source" (tokens may contain $, !, #, etc.).
read_env_var() {
  local key="$1" file="$2"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  local line
  line="$(grep -m1 "^${key}=" "$file" | tr -d '\r' || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  local val="${line#*=}"
  if [[ "$val" =~ ^\".*\"$ ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" =~ ^\'.*\'$ ]]; then
    val="${val:1:${#val}-2}"
  fi
  val="${val#Bearer }"
  val="${val#bearer }"
  printf '%s' "$val"
}
