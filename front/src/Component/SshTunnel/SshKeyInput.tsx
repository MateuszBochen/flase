import './style.css';
import React, {ChangeEvent, useRef} from 'react';
import toast from 'react-hot-toast';

interface SshKeyInputPropsInterface {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** private keys are a few KiB - bigger file is not a key */
const MAX_KEY_BYTES = 64 * 1024;

/** SshKeyInput - private key of SSH pasted or loaded from file of this computer (e.g. ~/.ssh/id_ed25519) */
export default (props: SshKeyInputPropsInterface) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_KEY_BYTES) {
      toast.error('File is too big for a private key');
      return;
    }
    file.text().then((text) => {
      if (!/PRIVATE KEY/.test(text)) {
        toast.error(`${file.name} is not a private key (public key is the .pub file)`);
        return;
      }
      props.onChange(text);
    });
  };

  return (
    <div className="cmp-ssh-key-input">
      <textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…'}
        spellCheck={false}
        rows={4}
        aria-label="Private key"
      />
      <div className="ssh-key-actions">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={props.disabled}>Load key file…</button>
        {props.value && <span>{/PRIVATE KEY/.test(props.value) ? 'Key loaded' : 'Not a private key'}</span>}
        <input ref={fileRef} type="file" hidden onChange={load} />
      </div>
    </div>
  );
}
