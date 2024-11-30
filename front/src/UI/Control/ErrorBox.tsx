import {InterfaceErrorBoxProps} from './Type/types';


const ErrorBox = (props: InterfaceErrorBoxProps) => {

  if (!props.errors?.length) {
    return null;
  }

  return (
    <div className="input-error-box" >
      <ul>
        {props.errors?.map((error) => <li key={error}>{error}</li>)}
      </ul>
    </div>
  );
}

export default ErrorBox;
