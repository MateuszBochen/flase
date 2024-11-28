import ViewPortPropsInterface from './ViewPortPropsInterface';

/**
 * View port object - is kind of mian coiner.
 * @author Mateusz Bochen
 */
export default (props: ViewPortPropsInterface) => {
  return (
    <div>
      {props.children}
    </div>
  );
}

