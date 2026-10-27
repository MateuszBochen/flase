import React, {useState} from 'react';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import '../TableRecords/Structure/style.css';

/** value of :parameter - text is escaped as string literal, sql is used as written (numbers, NULL, expressions) */
export type ParameterValueType = {value: string, sql: boolean};
export type ParameterValuesType = {[name: string]: ParameterValueType};

interface ParametersPopupPropsInterface {
  names: string[];
  /** values used last time */
  values: ParameterValuesType;
  onRun: (values: ParameterValuesType) => void;
  onCancel: () => void;
}

/** parameter not used before - empty text */
const defaultValue = (value?: ParameterValueType): ParameterValueType => value || {value: '', sql: false};

/** ParametersPopup - values of :parameters of statements before they are executed */
export default (props: ParametersPopupPropsInterface) => {
  const [values, setValues] = useState<ParameterValuesType>(
    () => Object.fromEntries(props.names.map((name) => [name, defaultValue(props.values[name])])),
  );
  const change = (name: string, change: Partial<ParameterValueType>) => setValues((previous) => ({...previous, [name]: {...previous[name], ...change}}));
  const run = () => props.onRun(values);

  return (
    <Popup
      openOnMount
      label="Parameters of query"
      onClickOk={run}
      onClose={props.onCancel}
      buttons={[
        <Button key="run" size="small" colorVariant="success" label="Execute" onClick={run} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <form className="cmp-structure-form cmp-query-parameters" onSubmit={(event) => { event.preventDefault(); run(); }}>
        {props.names.map((name, index) => (
          <label key={name}>
            <span className="parameter-name">:{name}</span>
            <span className="inline">
              <input
                value={values[name].value}
                onChange={(event) => change(name, {value: event.target.value})}
                autoFocus={index === 0}
                aria-label={`Value of ${name}`}
                placeholder={values[name].sql ? 'SQL expression, e.g. 10, NULL, NOW()' : 'text'}
              />
              <label className="checkbox" title="Value is SQL (number, NULL, function) - not quoted as text">
                <input type="checkbox" checked={values[name].sql} onChange={(event) => change(name, {sql: event.target.checked})} aria-label={`${name} as SQL`} />SQL
              </label>
            </span>
          </label>
        ))}
        <div className="hint">Text is quoted and escaped. Check SQL for numbers, NULL or expressions - the value is used as written.</div>
        <button type="submit" hidden />
      </form>
    </Popup>
  );
}
