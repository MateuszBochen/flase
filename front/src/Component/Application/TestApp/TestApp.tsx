import {Component, useCallback, useState} from 'react';


export default () => {
  const [state, setState] = useState<number>(0);

  const clickHandler = useCallback(() => {
    setState((prev) => prev + 1);
  }, [state]);

  return (
    <div>
      <div>
        <h3>{state}</h3>
      </div>

      <button onClick={clickHandler}>
        Klik
      </button>

    </div>
  );
}


/*class TestApp extends Component<undefined, {value: number}> {

  constructor(props: undefined) {
    console.log('new const');
    super(props);
    this.state = {
      value: 0,
    };
  }

  private clickHandler = () => {
    this.setState({value: this.state.value +1});
  }

  render() {
    return (
      <div>
        <div>
          <h3>{this.state.value}</h3>
        </div>

        <button onClick={this.clickHandler}>
          Klik
        </button>
      </div>
    );
  }

}

export default TestApp;*/
