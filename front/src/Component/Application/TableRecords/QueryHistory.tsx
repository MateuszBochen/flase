import IconButton from '../../../UI/Button/IconButton';
import {faArrowLeft, faArrowRight} from '@fortawesome/free-solid-svg-icons';
import React, {useEffect, useState} from 'react';
import QueryHistoryPropsInterface from './Interface/QueryHistoryPropsInterface';


/** QueryHistory */
export default (props: QueryHistoryPropsInterface) => {

  const [history, setHistory] = useState<string[]>([]); // Przechowuje historię stringów
  const [currentIndex, setCurrentIndex] = useState<number>(-1); // Index aktualnego elementu w historii

  useEffect(() => {
    if (props.value) {
      if (props.value !== history[currentIndex]) {
        if (currentIndex !== history.length - 1) {

          setHistory((prev) => [...prev.slice(0, currentIndex + 1), props.value]);
        } else {
          setHistory((prev) => [...prev, props.value]);
        }
        setCurrentIndex((prev) => prev + 1); // Zaktualizuj indeks
      }
    }
  }, [props.value]);

  const goPrevious = () => {
    console.log(history);
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1); // Przesuń się w lewo
      props.onHistoryChange(history[currentIndex-1]);
    }
  };

  const goNext = () => {
    console.log(history);
    if (currentIndex < history.length - 1) {
      setCurrentIndex((prev) => prev + 1); // Przesuń się w prawo
      props.onHistoryChange(history[currentIndex+1]);
    }
  };

  return (
    <>
      <div className="icon">
        <IconButton
          disabled={false}
          icon={faArrowLeft}
          onClick={goPrevious}
        />
      </div>
      <div className="icon">
        <IconButton
          disabled={false}
          icon={faArrowRight}
          onClick={goNext}
        />
      </div>
    </>
  )
}

