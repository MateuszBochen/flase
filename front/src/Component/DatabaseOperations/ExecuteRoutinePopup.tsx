import React, {useState} from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import DriverFactory from '../../Library/Database/Driver/DriverFactory';
import {DatabaseRoutineInterface} from '../../Library/Database/Interface/DatabaseObjectsInterface';
import '../Application/TableRecords/Structure/style.css';
import './style.css';

interface ExecuteRoutinePopupPropsInterface {
  connection: ConnectionDataInterface;
  database: string;
  routine: DatabaseRoutineInterface;
  /** statements are executed in SQL console */
  onExecute: (statements: string[]) => void;
  onCancel: () => void;
}

type ValueType = {value: string, isNull: boolean};

/** variable of OUT / INOUT parameter of MySQL procedure */
const variable = (name: string, index: number) => `@${(name || `p${index + 1}`).replace(/[^A-Za-z0-9_$]/g, '_')}`;

/** CALL of procedure / SELECT of function with given values (OUT parameters are read from variables / result) */
export const routineStatements = (dialect: string, database: string, routine: DatabaseRoutineInterface, values: ValueType[], sql: {identifier: (name: string) => string, value: (value: string | null) => string}): string[] => {
  const name = `${sql.identifier(database)}.${sql.identifier(routine.name)}`;
  const parameters = routine.parameters;
  const literal = (index: number) => values[index]?.isNull ? 'NULL' : sql.value(values[index]?.value ?? '');

  if (dialect === 'mysql') {
    if (routine.kind === 'FUNCTION') {
      return [`SELECT ${name}(${parameters.map((parameter, index) => literal(index)).join(', ')}) AS ${sql.identifier('result')}`];
    }
    const statements: string[] = [];
    const args = parameters.map((parameter, index) => {
      if (parameter.mode === 'IN') return literal(index);
      if (parameter.mode === 'INOUT') statements.push(`SET ${variable(parameter.name, index)} = ${literal(index)}`);
      return variable(parameter.name, index);
    });
    statements.push(`CALL ${name}(${args.join(', ')})`);
    const outputs = parameters.map((parameter, index) => ({parameter, index})).filter(({parameter}) => parameter.mode !== 'IN');
    if (outputs.length) {
      statements.push(`SELECT ${outputs.map(({parameter, index}) => `${variable(parameter.name, index)} AS ${sql.identifier(parameter.name || `p${index + 1}`)}`).join(', ')}`);
    }
    return statements;
  }

  // PostgreSQL - values are cast to parameter types (overloaded functions), OUT parameters of procedure get NULL
  const args = parameters
    .map((parameter, index) => ({parameter, index}))
    .filter(({parameter}) => routine.kind === 'PROCEDURE' || parameter.mode !== 'OUT')
    .map(({parameter, index}) => parameter.mode === 'OUT' ? `NULL::${parameter.type}` : `${literal(index)}::${parameter.type}`);
  return routine.kind === 'FUNCTION'
    ? [`SELECT * FROM ${name}(${args.join(', ')})`]
    : [`CALL ${name}(${args.join(', ')})`];
};

/** ExecuteRoutinePopup - values of parameters, call is executed in SQL console */
export default (props: ExecuteRoutinePopupPropsInterface) => {
  const driver = DriverFactory.getDriver(props.connection);
  const inputs = props.routine.parameters.filter((parameter) => parameter.mode !== 'OUT');
  const [values, setValues] = useState<ValueType[]>(props.routine.parameters.map(() => ({value: '', isNull: false})));

  const update = (index: number, value: Partial<ValueType>) => setValues((previous) => previous.map((item, itemIndex) => itemIndex === index ? {...item, ...value} : item));

  const execute = () => props.onExecute(routineStatements(driver.dialect, props.database, props.routine, values, {
    identifier: (name) => driver.sql.identifier(name),
    value: (value) => driver.sql.value(value),
  }));

  return (
    <Popup
      isOpen={true}
      label={`Execute ${props.routine.kind.toLowerCase()} ${props.routine.name}`}
      onClickOk={execute}
      buttons={[
        <Button key="execute" size="small" colorVariant="success" label="Execute in console" onClick={execute} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <form className="cmp-structure-form" onSubmit={(event) => { event.preventDefault(); execute(); }}>
        {!inputs.length && <div className="hint">No input parameters.</div>}
        {props.routine.parameters.map((parameter, index) => parameter.mode === 'OUT' ? null : (
          <label key={index}>
            <span className="routine-parameter">{parameter.name || `$${index + 1}`} <small>{parameter.mode !== 'IN' ? `${parameter.mode} ` : ''}{parameter.type}</small></span>
            <span className="inline">
              <input
                value={values[index].value}
                disabled={values[index].isNull}
                onChange={(event) => update(index, {value: event.target.value})}
                aria-label={parameter.name || `$${index + 1}`}
                autoFocus={index === props.routine.parameters.findIndex((item) => item.mode !== 'OUT')}
              />
              <label className="checkbox"><input type="checkbox" checked={values[index].isNull} onChange={(event) => update(index, {isNull: event.target.checked})} />NULL</label>
            </span>
          </label>
        ))}
        <button type="submit" hidden />
        <div className="hint">Statements are opened in SQL console and executed there{props.routine.parameters.some((parameter) => parameter.mode !== 'IN') ? ' - OUT values are in the result' : ''}.</div>
      </form>
    </Popup>
  );
}
